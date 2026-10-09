'use client'

import { useEffect, useState } from 'react'

export function Typewriter({ text, className }: { text: string; className?: string }) {
  const chars = Array.from(text)
  const [count, setCount] = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const full = count === chars.length
    const empty = count === 0
    const delay = !deleting && full ? 2600 : deleting && empty ? 500 : deleting ? 35 : 90
    const t = setTimeout(() => {
      if (!deleting && full) setDeleting(true)
      else if (deleting && empty) setDeleting(false)
      else setCount((c) => c + (deleting ? -1 : 1))
    }, delay)
    return () => clearTimeout(t)
  }, [count, deleting, chars.length])

  return (
    <p className={className} aria-label={text}>
      <span aria-hidden="true">{chars.slice(0, count).join('')}</span>
      <span aria-hidden="true" className="typing-caret ms-1 inline-block h-[0.9em] w-1 translate-y-1 rounded-full bg-primary" />
    </p>
  )
}
