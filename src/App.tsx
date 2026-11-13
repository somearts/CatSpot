import { useEffect, useState, useCallback, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import MapView from './components/Map'
import ReportModal from './components/ReportModal'
import { getCurrentPosition } from './services/geolocation'
import type { LocationResult, LocationError } from './services/geolocation'
import {
  submitSighting,
  fetchSightingsInBounds,
  fetchAllSightings,
  fetchTodaySightings,
  countAllSightings,
  countTodaySightings,
  reverseArea,
} from './services/sightings'
import type { Sighting } from './types'
import { CAT_TYPE_LABEL } from './types'

type Filter = 'all' | 'today' | 'nearby' | null

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

function temperament(f: Sighting['friendliness']): string {
  return f === 'friendly' ? 'Cooperated' : 'Declined to comment'
}

function useCountUp(target: number | null, start: boolean, reduced: boolean): number {
  const [value, setValue] = useState(0)
  const current = useRef(0)

  useEffect(() => {
    if (target == null || !start) return
    if (reduced) {
      current.current = target
      setValue(target)
      return
    }
    const from = current.current
    if (from === target) {
      setValue(target)
      return
    }
    const t0 = performance.now()
    const duration = 900
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const next = Math.round(from + (target - from) * eased)
      current.current = next
      setValue(next)
      if (p < 1) raf = requestAnimationFrame(tick)
      else {
        current.current = target
        setValue(target)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, start, reduced])

  return value
}

export default function App() {
  const [userLocation, setUserLocation] = useState<LocationResult | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationLoading, setLocationLoading] = useState(true)

  const [viewportSightings, setViewportSightings] = useState<Sighting[]>([])
  const [displayedSightings, setDisplayedSightings] = useState<Sighting[]>([])
  const [selected, setSelected] = useState<Sighting | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [todayCount, setTodayCount] = useState<number | null>(null)
  const [nearbyCount, setNearbyCount] = useState<number>(0)
  const [nearbyList, setNearbyList] = useState<Sighting[]>([])

  const [activeFilter, setActiveFilter] = useState<Filter>(null)
  const [filteredList, setFilteredList] = useState<Sighting[]>([])
  const [filterLoading, setFilterLoading] = useState(false)
  const [filterError, setFilterError] = useState<string | null>(null)

  const [statsInView, setStatsInView] = useState(false)
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const lastViewportRef = useRef<{ lat: number; lng: number; r: number } | null>(null)
  const statsRef = useRef<HTMLElement | null>(null)

  const requestLocation = useCallback(async () => {
    setLocationLoading(true)
    setLocationError(null)
    try {
      const loc = await getCurrentPosition()
      setUserLocation(loc)
    } catch (e) {
      const err = e as LocationError
      if (err.code === 1) setLocationError('Location access denied.')
      else if (err.code === 2) setLocationError('Position unavailable.')
      else if (err.code === 3) setLocationError('Position request timed out.')
      else setLocationError(err.message || 'Position could not be determined.')
      setUserLocation(null)
    } finally {
      setLocationLoading(false)
    }
  }, [])

  useEffect(() => {
    requestLocation()
  }, [requestLocation])

  useEffect(() => {
    countAllSightings().then(setTotalCount).catch(() => setTotalCount(null))
    countTodaySightings().then(setTodayCount).catch(() => setTodayCount(null))
  }, [])

  useEffect(() => {
    if (!userLocation) return
    fetchSightingsInBounds(userLocation.latitude, userLocation.longitude, 300)
      .then((list) => {
        setNearbyList(list)
        setNearbyCount(list.length)
      })
      .catch(() => {})
  }, [userLocation])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // reveal-on-scroll
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (reduced) {
      els.forEach((el) => el.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [reduced, activeFilter])

  // count-up trigger
  useEffect(() => {
    const el = statsRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStatsInView(true)
          io.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // subtle tilt on glass header from device orientation, where available
  useEffect(() => {
    if (reduced || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return
    let last = 0
    function onOrient(e: DeviceOrientationEvent) {
      if (e.beta == null || e.gamma == null) return
      const now = performance.now()
      if (now - last < 60) return
      last = now
      const x = Math.max(-5, Math.min(5, (e.beta - 45) / 9))
      const y = Math.max(-6, Math.min(6, e.gamma / 7))
      const root = document.documentElement
      root.style.setProperty('--tilt-x', `${x.toFixed(2)}deg`)
      root.style.setProperty('--tilt-y', `${y.toFixed(2)}deg`)
    }
    window.addEventListener('deviceorientation', onOrient, true)
    return () => window.removeEventListener('deviceorientation', onOrient, true)
  }, [reduced])

  const handleViewportChange = useCallback(async (center: { lat: number; lng: number }, radiusKm: number) => {
    const last = lastViewportRef.current
    if (last && Math.abs(last.lat - center.lat) < 0.001 && Math.abs(last.lng - center.lng) < 0.001 && Math.abs(last.r - radiusKm) < 0.5) {
      return
    }
    const cappedRadius = Math.min(radiusKm, 300)
    lastViewportRef.current = { lat: center.lat, lng: center.lng, r: cappedRadius }
    try {
      const fetched = await fetchSightingsInBounds(center.lat, center.lng, cappedRadius)
      setViewportSightings((prev) => {
        const map = new Map(prev.map((s) => [s.sightingId, s]))
        for (const s of fetched) map.set(s.sightingId, s)
        return Array.from(map.values())
      })
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!activeFilter) {
      setDisplayedSightings(viewportSightings)
    }
  }, [viewportSightings, activeFilter])

  async function runFilter(filter: Filter) {
    if (filter === activeFilter) {
      setActiveFilter(null)
      setFilteredList([])
      setFilterError(null)
      setDisplayedSightings(viewportSightings)
      return
    }
    if (filter === 'nearby' && !userLocation) {
      setFilterError('The nearby register requires a position.')
      return
    }
    setActiveFilter(filter)
    setFilterLoading(true)
    setFilterError(null)
    try {
      let list: Sighting[] = []
      if (filter === 'all') list = await fetchAllSightings()
      else if (filter === 'today') list = await fetchTodaySightings()
      else if (filter === 'nearby') list = nearbyList.length ? nearbyList : await fetchSightingsInBounds(userLocation!.latitude, userLocation!.longitude, 300)
      setFilteredList(list)
      setDisplayedSightings(list)
      if (filter === 'nearby' && !nearbyList.length) {
        setNearbyList(list)
        setNearbyCount(list.length)
      }
    } catch (e: any) {
      setFilterError(e?.message || 'The register could not be opened.')
    } finally {
      setFilterLoading(false)
    }
  }

  function clearFilter() {
    setActiveFilter(null)
    setFilteredList([])
    setFilterError(null)
    setDisplayedSightings(viewportSightings)
  }

  function focusSighting(s: Sighting) {
    setFocusTarget({ lat: s.publicLatitude, lng: s.publicLongitude })
    setSelected(s)
    setExpandedId(s.sightingId)
  }

  function handleSelectSighting(s: Sighting) {
    setFocusTarget({ lat: s.publicLatitude, lng: s.publicLongitude })
    setSelected(s)
    setExpandedId(null)
  }

  async function handleSubmit(catType: any, friendliness: any) {
    if (!userLocation) throw new Error('A position is required to file a sighting.')
    const area = await reverseArea(userLocation.latitude, userLocation.longitude)
    const created = await submitSighting({
      catType,
      friendliness,
      location: userLocation,
      approximateArea: area,
    })
    setViewportSightings((prev) => [created, ...prev.filter((s) => s.sightingId !== created.sightingId)])
    if (!activeFilter) setDisplayedSightings((prev) => [created, ...prev.filter((s) => s.sightingId !== created.sightingId)])
    else setFilteredList((prev) => [created, ...prev.filter((s) => s.sightingId !== created.sightingId)])
    setFocusTarget({ lat: created.publicLatitude, lng: created.publicLongitude })
    countAllSightings().then(setTotalCount).catch(() => {})
    countTodaySightings().then(setTodayCount).catch(() => {})
    if (userLocation) {
      fetchSightingsInBounds(userLocation.latitude, userLocation.longitude, 300).then((list) => {
        setNearbyList(list)
        setNearbyCount(list.length)
      }).catch(() => {})
    }
  }

  const handleCtaMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (reduced) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - rect.left - rect.width / 2) / rect.width
    const my = (e.clientY - rect.top - rect.height / 2) / rect.height
    e.currentTarget.style.setProperty('--mx', `${(mx * 9).toFixed(2)}px`)
    e.currentTarget.style.setProperty('--my', `${(my * 6).toFixed(2)}px`)
  }

  const handleCtaLeave = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.style.setProperty('--mx', '0px')
    e.currentTarget.style.setProperty('--my', '0px')
  }

  const showingFilter = activeFilter !== null
  const totalValue = useCountUp(totalCount, statsInView, reduced)
  const todayValue = useCountUp(todayCount, statsInView, reduced)
  const nearbyValue = useCountUp(nearbyCount, statsInView, reduced)

  return (
    <div className="app">
      <div className="aurora" aria-hidden="true">
        <span className="aurora__blob aurora__blob--ginger" />
        <span className="aurora__blob aurora__blob--violet" />
        <span className="aurora__blob aurora__blob--mint" />
      </div>

      <header className="brand">
        <div className="brand__in">
          <h1 className="logo" aria-label="CatSpot">CatSpot</h1>
          <p className="tagline">A database of no strategic importance.</p>
        </div>
      </header>

      <main id="top" className="main">
        <section className="map-hero">
          <div className="map-frame">
            <MapView
              userLocation={userLocation}
              sightings={displayedSightings}
              focusTarget={focusTarget}
              onViewportChange={handleViewportChange}
              onSelectSighting={handleSelectSighting}
            />

            {locationLoading && <div className="map-overlay">Triangulating position…</div>}
          </div>

          {/* Sits above the map frame rather than inside it, so assistive tech
              keeps the headline alongside the labelled map region. */}
          <div className="hero">
            <p className="hero__eyebrow">Field record · ongoing</p>
            <h2 className="hero__headline">
              Cats were here.<br />The evidence is on file.
            </h2>
            <p className="hero__support">
              Every neighbourhood has its mysteries.<br />
              Most of them have whiskers.
            </p>
          </div>
        </section>

        <section className="stats" aria-label="Sighting statistics" ref={statsRef}>
          <button
            type="button"
            className={`stat-chip ${activeFilter === 'all' ? 'is-active' : ''}`}
            style={{ '--accent': 'var(--ginger)' } as CSSProperties}
            aria-pressed={activeFilter === 'all'}
            onClick={() => runFilter('all')}
          >
            <span className="stat-chip__label">
              <span className="stat-chip__dot" aria-hidden="true" />
              All cats
            </span>
            <span className="stat-chip__num" key={`total-${totalCount ?? 'na'}`}>
              {totalCount === null ? '—' : totalValue}
            </span>
          </button>

          <button
            type="button"
            className={`stat-chip ${activeFilter === 'today' ? 'is-active' : ''}`}
            style={{ '--accent': 'var(--butter)' } as CSSProperties}
            aria-pressed={activeFilter === 'today'}
            onClick={() => runFilter('today')}
          >
            <span className="stat-chip__label">
              <span className="stat-chip__dot" aria-hidden="true" />
              Today
            </span>
            <span className="stat-chip__num" key={`today-${todayCount ?? 'na'}`}>
              {todayCount === null ? '—' : todayValue}
            </span>
          </button>

          <button
            type="button"
            className={`stat-chip ${activeFilter === 'nearby' ? 'is-active' : ''}`}
            style={{ '--accent': 'var(--sage)' } as CSSProperties}
            aria-pressed={activeFilter === 'nearby'}
            onClick={() => runFilter('nearby')}
            title={locationError || undefined}
          >
            <span className="stat-chip__label">
              <span className="stat-chip__dot" aria-hidden="true" />
              Nearby
            </span>
            <span className="stat-chip__num" key={`nearby-${nearbyCount}`}>{nearbyValue}</span>
          </button>
        </section>

        {filterError && <p className="filter-error">{filterError}</p>}

        {selected && expandedId === null && (
          <section className="inline-details inline-details--standalone">
            <p className="inline-details__line"><strong>{CAT_TYPE_LABEL[selected.catType]} cat</strong></p>
            <p className="inline-details__line">{temperament(selected.friendliness)}</p>
            <p className="inline-details__line">Spotted {timeAgo(selected.createdAt)}</p>
            {selected.approximateArea && <p className="inline-details__line">{selected.approximateArea}</p>}
            <a
              className="inline-details__maps"
              href={`https://www.google.com/maps/search/?api=1&query=${selected.publicLatitude},${selected.publicLongitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Maps
            </a>
          </section>
        )}

        {showingFilter && (
          <section className="filter-panel">
            <div className="filter-panel__head">
              <strong>
                {activeFilter === 'all' && 'All records'}
                {activeFilter === 'today' && "Today's records"}
                {activeFilter === 'nearby' && 'Records within range'}
              </strong>
              {filterLoading && <span className="filter-loading">Retrieving…</span>}
              <button className="filter-clear" onClick={clearFilter}>Clear filter</button>
            </div>
            {!filterLoading && filteredList.length === 0 && (
              <p className="filter-empty">No records. The database remains incomplete.</p>
            )}
            <ul className="filter-list">
              {filteredList.map((s) => (
                <li key={s.sightingId} className="filter-list__item">
                  <button
                    type="button"
                    className="filter-item"
                    aria-expanded={expandedId === s.sightingId}
                    onClick={() => {
                      if (expandedId === s.sightingId) setExpandedId(null)
                      else focusSighting(s)
                    }}
                  >
                    <span className="filter-item__title">{CAT_TYPE_LABEL[s.catType]} cat</span>
                    <span className="filter-item__meta">
                      {temperament(s.friendliness)}
                      {s.approximateArea ? ` · ${s.approximateArea}` : ''}
                    </span>
                  </button>
                  {expandedId === s.sightingId && (
                    <div className="inline-details">
                      <p className="inline-details__line"><strong>{CAT_TYPE_LABEL[s.catType]} cat</strong></p>
                      <p className="inline-details__line">{temperament(s.friendliness)}</p>
                      <p className="inline-details__line">Spotted {timeAgo(s.createdAt)}</p>
                      {s.approximateArea && <p className="inline-details__line">{s.approximateArea}</p>}
                      <a
                        className="inline-details__maps"
                        href={`https://www.google.com/maps/search/?api=1&query=${s.publicLatitude},${s.publicLongitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in Google Maps
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="editorial">
          <p className="editorial__lead" data-reveal>A planet without cats would be a clerical error.</p>
          <p className="editorial__body" data-reveal style={{ '--d': '90ms' } as CSSProperties}>
            Cats occupy walls, doorsteps and vehicles they do not own. They contribute
            nothing measurable and improve everything anyway.
          </p>
        </section>
      </main>

      <section className="cta-section">
        <button
          className="cta"
          onClick={() => setModalOpen(true)}
          onPointerMove={handleCtaMove}
          onPointerLeave={handleCtaLeave}
        >
          File a sighting
        </button>
      </section>

      <footer className="foot">
        <div className="wrap">
          <p>CatSpot · A GoLake project</p>
          <p>Records are approximate. Cats are not.</p>
        </div>
      </footer>

      <ReportModal
        open={modalOpen}
        location={userLocation}
        locationError={locationError}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        onRetryLocation={requestLocation}
      />
    </div>
  )
}
