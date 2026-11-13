export type CatType =
  | 'ginger'
  | 'black'
  | 'white'
  | 'grey'
  | 'tabby'
  | 'calico'
  | 'mixed'
  | 'other'

export type Friendliness = 'friendly' | 'not_friendly'

export interface Sighting {
  sightingId: string
  catType: CatType
  friendliness: Friendliness
  createdAt: number // epoch ms (client-normalised)
  publicLatitude: number
  publicLongitude: number
  locationAccuracy: number
  approximateArea: string
  schemaVersion: number
  geohash: string
}

export const CAT_TYPES: { value: CatType; label: string; swatch: string }[] = [
  { value: 'ginger', label: 'Ginger', swatch: '#d98a3a' },
  { value: 'black', label: 'Black', swatch: '#1a1a1a' },
  { value: 'white', label: 'White', swatch: '#f4f4f4' },
  { value: 'grey', label: 'Grey', swatch: '#9a9a9a' },
  { value: 'tabby', label: 'Tabby', swatch: '#b07a3a' },
  { value: 'calico', label: 'Calico / Tortoiseshell', swatch: '#c9a27a' },
  { value: 'mixed', label: 'Mixed / Multicoloured', swatch: '#a0a0a0' },
  { value: 'other', label: 'Other / Not sure', swatch: '#cccccc' },
]

export const CAT_TYPE_LABEL: Record<CatType, string> = {
  ginger: 'Ginger',
  black: 'Black',
  white: 'White',
  grey: 'Grey',
  tabby: 'Tabby',
  calico: 'Calico / Tortoiseshell',
  mixed: 'Mixed / Multicoloured',
  other: 'Other / Not sure',
}