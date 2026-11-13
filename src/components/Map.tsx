import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { Sighting } from '../types'
import { CAT_TYPE_LABEL, CAT_TYPES } from '../types'

interface LocationResult { latitude: number; longitude: number; accuracy: number; timestamp: number }

interface Props {
  userLocation: LocationResult | null
  sightings: Sighting[]
  focusTarget: { lat: number; lng: number } | null
  onViewportChange: (center: { lat: number; lng: number }, radiusKm: number) => void
  onSelectSighting: (s: Sighting) => void
}

const SWATCH: Record<string, string> = Object.fromEntries(
  CAT_TYPES.map((c) => [c.value, c.swatch]),
)

const EYE_DARK = '#0b0b12'
const EYE_LIGHT = '#f7f4ee'

function catGlyphHtml(s: Sighting, isNew: boolean, delay: number): string {
  const color = SWATCH[s.catType] ?? '#a0a0a0'
  const dark = s.catType === 'black'
  const eye = dark || s.catType === 'grey' ? EYE_LIGHT : EYE_DARK
  return `
    <span class="cat-pin ${dark ? 'cat-pin--dark' : ''} ${isNew ? 'is-new' : ''}"
          style="--pin:${color};--pin-eye:${eye};animation-delay:${delay}ms">
      <svg class="cat-pin__head" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 9.4V4.2c0-.75.86-1.17 1.46-.72L9.7 5.7h4.6l3.24-2.22c.6-.45 1.46-.03 1.46.72v5.2c0 4.5-3.32 7.7-7 7.7S5 13.9 5 9.4Z"
              fill="${color}"
              stroke="${dark ? 'rgba(255,255,255,.82)' : 'rgba(9,9,14,.55)'}"
              stroke-width="1.1"/>
        <circle cx="9.5" cy="10.1" r="1.05" fill="${eye}"/>
        <circle cx="14.5" cy="10.1" r="1.05" fill="${eye}"/>
      </svg>
      <span class="cat-pin__ripple" aria-hidden="true"></span>
    </span>`
}

export default function MapView({ userLocation, sightings, focusTarget, onViewportChange, onSelectSighting }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const clusterRef = useRef<any>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  const onViewportRef = useRef(onViewportChange)
  const onSelectRef = useRef(onSelectSighting)
  const sightingsRef = useRef(sightings)
  const seenRef = useRef<Set<string>>(new Set())
  sightingsRef.current = sightings
  onViewportRef.current = onViewportChange
  onSelectRef.current = onSelectSighting

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const initialCenter: [number, number] = userLocation
      ? [userLocation.latitude, userLocation.longitude]
      : [20, 0]

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: userLocation ? 14 : 2,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
    })
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const clusterGroup = (L as any).markerClusterGroup({
      maxClusterRadius: 48,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          className: 'cluster-wrap',
          html: `<span class="cluster-bubble">${count}</span>`,
          iconSize: [52, 52],
          iconAnchor: [26, 26],
        })
      },
    })
    clusterRef.current = clusterGroup
    map.addLayer(clusterGroup)

    function emitViewport() {
      const c = map.getCenter()
      const bounds = map.getBounds()
      const ne = bounds.getNorthEast()
      const R = 6371
      const toRad = Math.PI / 180
      const dLat = (ne.lat - c.lat) * toRad
      const dLng = (ne.lng - c.lng) * toRad
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(c.lat * toRad) * Math.cos(ne.lat * toRad) * Math.sin(dLng / 2) ** 2
      const dist = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      onViewportRef.current({ lat: c.lat, lng: c.lng }, Math.max(1, dist))
    }

    let moveTimer: any
    map.on('moveend', () => {
      clearTimeout(moveTimer)
      moveTimer = setTimeout(emitViewport, 250)
    })
    map.on('zoomend', () => {
      clearTimeout(moveTimer)
      moveTimer = setTimeout(emitViewport, 250)
    })

    // initial
    setTimeout(emitViewport, 300)

    return () => {
      map.remove()
      mapRef.current = null
      clusterRef.current = null
    }
  }, [])

  // user location marker — pulsing radar ring
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (userMarkerRef.current) {
      userMarkerRef.current.remove()
      userMarkerRef.current = null
    }
    if (!userLocation) return
    const marker = L.marker([userLocation.latitude, userLocation.longitude], {
      icon: L.divIcon({
        className: 'user-wrap',
        html: `<span class="user-radar" aria-hidden="true">
                 <span class="user-radar__ring"></span>
                 <span class="user-radar__ring"></span>
                 <span class="user-radar__dot"></span>
               </span>`,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000,
    }).addTo(map)
    userMarkerRef.current = marker
    map.setView([userLocation.latitude, userLocation.longitude], Math.max(map.getZoom(), 13))
  }, [userLocation])

  // focus target — fly smoothly
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusTarget) return
    map.flyTo([focusTarget.lat, focusTarget.lng], Math.max(map.getZoom(), 15), {
      duration: 0.9,
      easeLinearity: 0.22,
    })
  }, [focusTarget])

  // update sightings data
  useEffect(() => {
    const map = mapRef.current
    const clusterGroup = clusterRef.current
    if (!map || !clusterGroup) return
    clusterGroup.clearLayers()
    const seen = seenRef.current
    sightings.forEach((s, index) => {
      const isNew = !seen.has(s.sightingId)
      seen.add(s.sightingId)
      const recent = Date.now() - s.createdAt < 24 * 60 * 60 * 1000
      const marker = L.marker([s.publicLatitude, s.publicLongitude], {
        icon: L.divIcon({
          className: 'cat-pin-wrap',
          html: catGlyphHtml(s, isNew, Math.min(index, 12) * 45),
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        }),
        title: `${CAT_TYPE_LABEL[s.catType]} cat sighting`,
        alt: `${CAT_TYPE_LABEL[s.catType]} cat sighting`,
        keyboard: true,
        riseOnHover: true,
        zIndexOffset: recent ? 200 : 0,
      })
      marker.on('click', () => onSelectRef.current(s))
      clusterGroup.addLayer(marker)
    })
  }, [sightings])

  return <div ref={containerRef} className="map-container" aria-label="Map of cat sightings" />
}
