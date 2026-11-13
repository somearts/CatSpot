import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp,
  Timestamp,
  getCountFromServer,
} from 'firebase/firestore'
import { geohashForLocation, geohashQueryBounds, distanceBetween } from 'geofire-common'
import { db } from '../firebase'
import type { CatType, Friendliness, Sighting } from '../types'

const SCHEMA_VERSION = 1
const PUBLIC_COLLECTION = 'sightings'
const PRIVATE_COLLECTION = 'sightingPrivate'

export const CAT_TYPES_VALUES: CatType[] = [
  'ginger', 'black', 'white', 'grey', 'tabby', 'calico', 'mixed', 'other',
]

function isValidCatType(v: unknown): v is CatType {
  return typeof v === 'string' && CAT_TYPES_VALUES.includes(v as CatType)
}

function isValidFriendliness(v: unknown): v is Friendliness {
  return v === 'friendly' || v === 'not_friendly'
}

// Controlled displacement of the public coordinate (50-100m).
export function displaceCoordinate(
  lat: number,
  lng: number,
): { latitude: number; longitude: number } {
  const distanceM = 50 + Math.random() * 50
  const angle = Math.random() * Math.PI * 2
  const R = 6371000
  const d = distanceM / R
  const lat1 = (lat * Math.PI) / 180
  const lng1 = (lng * Math.PI) / 180
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(angle),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(angle) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    )
  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (lng2 * 180) / Math.PI,
  }
}

export interface SubmitInput {
  catType: CatType
  friendliness: Friendliness
  location: { latitude: number; longitude: number; accuracy: number }
  approximateArea: string
}

export async function submitSighting(input: SubmitInput): Promise<Sighting> {
  if (!isValidCatType(input.catType)) throw new Error('Invalid cat type')
  if (!isValidFriendliness(input.friendliness)) throw new Error('Invalid friendliness')
  const { latitude, longitude, accuracy } = input.location
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('Invalid latitude')
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('Invalid longitude')
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1000) throw new Error('Location too inaccurate')

  const displaced = displaceCoordinate(latitude, longitude)
  const geohash = geohashForLocation([displaced.latitude, displaced.longitude], 12)

  const publicDoc = {
    catType: input.catType,
    friendliness: input.friendliness,
    createdAt: serverTimestamp(),
    publicLatitude: displaced.latitude,
    publicLongitude: displaced.longitude,
    locationAccuracy: accuracy,
    approximateArea: (input.approximateArea || '').slice(0, 200),
    schemaVersion: SCHEMA_VERSION,
    geohash,
  }

  const ref = await addDoc(collection(db, PUBLIC_COLLECTION), publicDoc)

  // Store private original coordinates in a write-only collection (no client reads).
  try {
    await addDoc(collection(db, PRIVATE_COLLECTION), {
      sightingId: ref.id,
      latitude,
      longitude,
      accuracy,
      createdAt: serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    })
  } catch {
    // Do not block public submission if private store fails.
  }

  return {
    sightingId: ref.id,
    catType: input.catType,
    friendliness: input.friendliness,
    createdAt: Date.now(),
    publicLatitude: displaced.latitude,
    publicLongitude: displaced.longitude,
    locationAccuracy: accuracy,
    approximateArea: input.approximateArea,
    schemaVersion: SCHEMA_VERSION,
    geohash,
  }
}

export async function fetchSightingsInBounds(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  maxResults = 300,
): Promise<Sighting[]> {
  const bounds = geohashQueryBounds([centerLat, centerLng], radiusKm * 1000)
  const promises = bounds.map((b) =>
    getDocs(
      query(
        collection(db, PUBLIC_COLLECTION),
        where('geohash', '>=', b[0]),
        where('geohash', '<=', b[1]),
        limit(200),
      ),
    ),
  )
  const snapshots = await Promise.all(promises)
  const seen = new Set<string>()
  const results: Sighting[] = []
  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue
      seen.add(doc.id)
      const d = doc.data() as any
      // distance filter
      const dist = distanceBetween([d.publicLatitude, d.publicLongitude], [centerLat, centerLng])
      if (dist > radiusKm) continue
      results.push({
        sightingId: doc.id,
        catType: d.catType,
        friendliness: d.friendliness,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : Date.now(),
        publicLatitude: d.publicLatitude,
        publicLongitude: d.publicLongitude,
        locationAccuracy: d.locationAccuracy ?? 0,
        approximateArea: d.approximateArea ?? '',
        schemaVersion: d.schemaVersion ?? 1,
        geohash: d.geohash,
      })
      if (results.length >= maxResults) break
    }
    if (results.length >= maxResults) break
  }
  return results
}

export async function countAllSightings(): Promise<number> {
  const snap = await getCountFromServer(collection(db, PUBLIC_COLLECTION))
  return snap.data().count
}

export async function fetchAllSightings(maxResults = 500): Promise<Sighting[]> {
  const snap = await getDocs(query(collection(db, PUBLIC_COLLECTION), limit(maxResults)))
  const results: Sighting[] = []
  for (const doc of snap.docs) {
    const d = doc.data() as any
    results.push({
      sightingId: doc.id,
      catType: d.catType,
      friendliness: d.friendliness,
      createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : Date.now(),
      publicLatitude: d.publicLatitude,
      publicLongitude: d.publicLongitude,
      locationAccuracy: d.locationAccuracy ?? 0,
      approximateArea: d.approximateArea ?? '',
      schemaVersion: d.schemaVersion ?? 1,
      geohash: d.geohash,
    })
  }
  return results
}

export async function fetchTodaySightings(maxResults = 500): Promise<Sighting[]> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const q = query(collection(db, PUBLIC_COLLECTION), where('createdAt', '>=', Timestamp.fromDate(start)), limit(maxResults))
  const snap = await getDocs(q)
  const results: Sighting[] = []
  for (const doc of snap.docs) {
    const d = doc.data() as any
    results.push({
      sightingId: doc.id,
      catType: d.catType,
      friendliness: d.friendliness,
      createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : Date.now(),
      publicLatitude: d.publicLatitude,
      publicLongitude: d.publicLongitude,
      locationAccuracy: d.locationAccuracy ?? 0,
      approximateArea: d.approximateArea ?? '',
      schemaVersion: d.schemaVersion ?? 1,
      geohash: d.geohash,
    })
  }
  return results
}

export async function countTodaySightings(): Promise<number> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const q = query(collection(db, PUBLIC_COLLECTION), where('createdAt', '>=', Timestamp.fromDate(start)))
  const snap = await getCountFromServer(q)
  return snap.data().count
}

export async function reverseArea(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
    if (!res.ok) return ''
    const data = await res.json()
    const a = data.address || {}
    const parts = [a.suburb, a.neighbourhood, a.city || a.town || a.village, a.state]
      .filter(Boolean)
    // de-dupe
    const unique: string[] = []
    for (const p of parts) if (!unique.includes(p)) unique.push(p)
    return unique.slice(0, 3).join(', ')
  } catch {
    return ''
  }
}