import type { Sighting } from '../types'
import { CAT_TYPE_LABEL } from '../types'

interface Props {
  sighting: Sighting | null
  onClose: () => void
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function SightingPanel({ sighting, onClose }: Props) {
  if (!sighting) return null
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${sighting.publicLatitude},${sighting.publicLongitude}`

  return (
    <div className="sighting-panel" role="dialog" aria-label="Cat sighting">
      <div className="sighting-panel__head">
        <strong>{CAT_TYPE_LABEL[sighting.catType]} cat</strong>
        <button className="sighting-panel__close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p className="sighting-panel__line">{sighting.friendliness === 'friendly' ? 'Friendly' : 'Not friendly'}</p>
      <p className="sighting-panel__line">Spotted {timeAgo(sighting.createdAt)}</p>
      {sighting.approximateArea && (
        <p className="sighting-panel__line sighting-panel__area">{sighting.approximateArea}</p>
      )}
      <a className="sighting-panel__maps" href={mapsUrl} target="_blank" rel="noopener noreferrer">
        Open in Google Maps
      </a>
    </div>
  )
}