import { useState, useEffect, type CSSProperties } from 'react'
import { CAT_TYPES } from '../types'
import type { CatType, Friendliness } from '../types'

interface Location { latitude: number; longitude: number; accuracy: number }

interface Props {
  open: boolean
  location: Location | null
  locationError: string | null
  onClose: () => void
  onSubmit: (catType: CatType, friendliness: Friendliness) => Promise<void>
  onRetryLocation: () => void
}

function CatGlyph({ color, dark }: { color: string; dark: boolean }) {
  return (
    <svg className="cat-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 9.4V4.2c0-.75.86-1.17 1.46-.72L9.7 5.7h4.6l3.24-2.22c.6-.45 1.46-.03 1.46.72v5.2c0 4.5-3.32 7.7-7 7.7S5 13.9 5 9.4Z"
        fill={color}
        stroke={dark ? 'rgba(255,255,255,.82)' : 'rgba(9,9,14,.55)'}
        strokeWidth="1.1"
      />
      <circle cx="9.5" cy="10.1" r="1.05" fill={dark ? '#f7f4ee' : '#0b0b12'} />
      <circle cx="14.5" cy="10.1" r="1.05" fill={dark ? '#f7f4ee' : '#0b0b12'} />
    </svg>
  )
}

const PAWS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2
  const distance = 34 + (i % 3) * 12
  return {
    x: `${Math.round(Math.cos(angle) * distance)}px`,
    y: `${Math.round(Math.sin(angle) * distance)}px`,
    r: `${Math.round((i - 5) * 18)}deg`,
    delay: `${i * 18}ms`,
  }
})

export default function ReportModal({ open, location, locationError, onClose, onSubmit, onRetryLocation }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [catType, setCatType] = useState<CatType | null>(null)
  const [friendliness, setFriendliness] = useState<Friendliness | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setStep(1)
      setCatType(null)
      setFriendliness(null)
      setError(null)
      setSubmitting(false)
      setDone(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const canSubmit = !!catType && !!friendliness && !!location && !submitting

  async function handleFile() {
    if (!catType || !friendliness) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(catType, friendliness)
      setDone(true)
      window.setTimeout(onClose, 700)
    } catch (e: any) {
      setError(e?.message || 'The database refused the record. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catspot-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />

        {done ? (
          <div className="sheet-success" role="status" aria-live="polite">
            <div className="paw-burst" aria-hidden="true">
              <span className="paw-burst__core" />
              {PAWS.map((p, i) => (
                <svg
                  key={i}
                  className="paw"
                  viewBox="0 0 24 24"
                  style={
                    {
                      '--x': p.x,
                      '--y': p.y,
                      '--r': p.r,
                      '--delay': p.delay,
                    } as CSSProperties
                  }
                >
                  <g fill="currentColor">
                    <ellipse cx="12" cy="16" rx="5" ry="4" />
                    <circle cx="6" cy="9" r="2.2" />
                    <circle cx="12" cy="7" r="2.2" />
                    <circle cx="18" cy="9" r="2.2" />
                  </g>
                </svg>
              ))}
            </div>
            <p className="sheet-success__title">Record filed.</p>
            <p className="sheet-success__line">The database is marginally less incomplete.</p>
          </div>
        ) : (
          <>
            <div className="modal__head">
              <div>
                <p className="sheet-step">
                  {step === 1 ? 'Step 1 of 2 · Coat' : 'Step 2 of 2 · Disposition'}
                </p>
                <h2 className="modal__title" id="catspot-sheet-title">
                  {step === 1 ? 'Subject description' : 'Subject temperament'}
                </h2>
              </div>
              <button className="modal__close" onClick={onClose} aria-label="Close sighting form">
                ×
              </button>
            </div>

            {step === 1 ? (
              <div className="modal__section">
                <p className="modal__q">Select the coat. Approximation is acceptable.</p>
                <div className="cat-grid">
                  {CAT_TYPES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`cat-option ${catType === c.value ? 'is-selected' : ''}`}
                      style={{ '--accent': c.swatch } as CSSProperties}
                      aria-pressed={catType === c.value}
                      onClick={() => setCatType(c.value)}
                    >
                      <CatGlyph color={c.swatch} dark={c.value === 'black'} />
                      <span className="cat-label">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="modal__section">
                  <p className="modal__q">How did the subject respond?</p>
                  <div className="friend-row">
                    <button
                      type="button"
                      className={`friend-option ${friendliness === 'friendly' ? 'is-selected' : ''}`}
                      aria-pressed={friendliness === 'friendly'}
                      onClick={() => setFriendliness('friendly')}
                    >
                      Cooperated
                    </button>
                    <button
                      type="button"
                      className={`friend-option ${friendliness === 'not_friendly' ? 'is-selected' : ''}`}
                      aria-pressed={friendliness === 'not_friendly'}
                      onClick={() => setFriendliness('not_friendly')}
                    >
                      Declined to comment
                    </button>
                  </div>
                </div>

                <div className="modal__location">
                  {location ? (
                    <p className="loc-ok">
                      Position acquired · ±{Math.round(location.accuracy)} m
                      {location.accuracy > 100 && (
                        <button className="loc-retry" onClick={onRetryLocation}>Improve</button>
                      )}
                    </p>
                  ) : locationError ? (
                    <p className="loc-err">
                      Position unavailable. {locationError}
                      <button className="loc-retry" onClick={onRetryLocation}>Retry</button>
                    </p>
                  ) : (
                    <p className="loc-warn">Acquiring position…</p>
                  )}
                </div>
              </>
            )}

            {error && <p className="modal__error">{error}</p>}

            <div className="modal__foot">
              {step === 2 && (
                <button type="button" className="modal__back" onClick={() => setStep(1)}>
                  Back
                </button>
              )}
              {step === 1 ? (
                <button
                  type="button"
                  className="modal__submit"
                  disabled={!catType}
                  onClick={() => setStep(2)}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="modal__submit"
                  disabled={!canSubmit}
                  onClick={handleFile}
                >
                  {submitting ? 'Filing…' : 'File record'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
