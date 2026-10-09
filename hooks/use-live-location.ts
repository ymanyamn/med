'use client'

import { useEffect, useState } from 'react'

export interface LiveLocation {
  lat: number
  lng: number
  accuracy: number
}

export type LocationState = 'locating' | 'ok' | 'denied' | 'unavailable'

/**
 * Starts acquiring the device position as soon as the page mounts, without any
 * in-app notice. Browsers still require their own one-time permission grant.
 * Tries high accuracy (GPS) first, then falls back to network-based positioning.
 */
export function useLiveLocation() {
  const [location, setLocation] = useState<LiveLocation | null>(null)
  const [state, setState] = useState<LocationState>('locating')

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState('unavailable')
      return
    }
    const geo = navigator.geolocation
    let fallbackTried = false

    const onSuccess = (pos: GeolocationPosition) => {
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
      setState('ok')
    }
    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setState('denied')
        return
      }
      if (!fallbackTried) {
        fallbackTried = true
        geo.getCurrentPosition(onSuccess, () => setState((s) => (s === 'ok' ? s : 'unavailable')), {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 60000,
        })
      }
    }

    const watchId = geo.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 5000,
    })
    return () => geo.clearWatch(watchId)
  }, [])

  return { location, state }
}
