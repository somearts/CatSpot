export interface LocationResult {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

export interface LocationError {
  code: number
  message: string
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

export function getCurrentPosition(options?: PositionOptions): Promise<LocationResult> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject({ code: 0, message: 'Geolocation is not supported by this browser.' } as LocationError)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        })
      },
      (err) => {
        reject({ code: err.code, message: err.message } as LocationError)
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
        ...options,
      },
    )
  })
}

export function watchPosition(
  onUpdate: (loc: LocationResult) => void,
  onError?: (err: LocationError) => void,
  options?: PositionOptions,
): () => void {
  if (!isGeolocationSupported()) {
    onError?.({ code: 0, message: 'Geolocation is not supported.' })
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      })
    },
    (err) => {
      onError?.({ code: err.code, message: err.message })
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000, ...options },
  )
  return () => navigator.geolocation.clearWatch(id)
}