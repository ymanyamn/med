'use client'

import { useEffect, useRef, useState } from 'react'

export function useTicker(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[0, 0.28, 0.56].forEach((offset) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.08, ctx.currentTime + offset)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + offset)
      osc.stop(ctx.currentTime + offset + 0.22)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch {
    /* audio may be blocked until the user interacts with the page */
  }
}

/** Plays an alert sound and shows a system notification whenever a new id appears. */
export function useNewItemAlert(ids: string[] | undefined, title: string) {
  const seen = useRef<Set<string> | null>(null)
  const key = ids?.join(',')

  useEffect(() => {
    if (!ids) return
    if (seen.current === null) {
      seen.current = new Set(ids)
      return
    }
    const fresh = ids.filter((id) => !seen.current!.has(id))
    ids.forEach((id) => seen.current!.add(id))
    if (fresh.length === 0) return
    beep()
    if ('vibrate' in navigator) navigator.vibrate?.([200, 100, 200])
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: `بلاغ رقم ${fresh[0]}`, icon: '/icon-512.png', tag: fresh[0] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, title])
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => null)
  }
}
