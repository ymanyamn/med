'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const LINES: { text: string; dir: 'rtl' | 'ltr'; prompt?: boolean }[] = [
  { text: '$ med --about', dir: 'ltr', prompt: true },
  { text: 'تم التصميم والتطوير من قبل: محمد الحسين', dir: 'rtl' },
  { text: 'الهاتف: 0952725590', dir: 'rtl' },
  { text: 'M-Code — مؤسسة مهتمة بالتطويرات البرمجية', dir: 'rtl' },
  { text: 'يمكنك التواصل للاستفسار.', dir: 'rtl' },
  { text: '$ med --about --lang=en', dir: 'ltr', prompt: true },
  { text: 'Designed & developed by: Mohammad Al-Hussein', dir: 'ltr' },
  { text: 'Phone: 0952725590', dir: 'ltr' },
  { text: 'M-Code — a foundation dedicated to software development.', dir: 'ltr' },
  { text: 'Feel free to get in touch for any inquiries.', dir: 'ltr' },
  { text: '$ _', dir: 'ltr', prompt: true },
]

export function DeveloperTerminal() {
  const [open, setOpen] = useState(false)
  const [line, setLine] = useState(0)
  const [char, setChar] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    if (!open || line >= LINES.length) return
    const current = Array.from(LINES[line].text)
    const t = setTimeout(
      () => {
        if (char < current.length) setChar((c) => c + 1)
        else {
          setLine((l) => l + 1)
          setChar(0)
        }
      },
      char < current.length ? 28 : 260,
    )
    return () => clearTimeout(t)
  }, [open, line, char])

  function show() {
    setLine(0)
    setChar(0)
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
      >
        معلومات المبرمج
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialogRef.current && setOpen(false)}
        aria-label="معلومات المبرمج"
        className="m-auto w-[min(92vw,40rem)] overflow-hidden rounded-xl border border-primary/40 bg-foreground/80 p-0 text-primary-foreground shadow-2xl backdrop-blur-md backdrop:bg-foreground/30 backdrop:backdrop-blur-sm"
      >
        <div dir="ltr" className="flex items-center justify-between border-b border-primary-foreground/10 px-4 py-2">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-3 rounded-full bg-destructive" />
            <span className="size-3 rounded-full bg-primary-foreground/40" />
            <span className="size-3 rounded-full bg-primary" />
          </div>
          <span className="font-mono text-xs text-primary-foreground/60">m-code@med: ~</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-72 flex-col gap-1.5 p-5 font-mono text-sm leading-relaxed" aria-live="polite">
          {LINES.slice(0, line + 1).map((l, i) => {
            if (i > line || (i === line && line >= LINES.length)) return null
            const shown = i < line ? l.text : Array.from(l.text).slice(0, char).join('')
            return (
              <p
                key={i}
                dir={l.dir}
                className={l.prompt ? 'text-secondary' : 'text-primary-foreground/90'}
                style={{ textAlign: l.dir === 'rtl' ? 'right' : 'left' }}
              >
                {!l.prompt && <span className="text-secondary">{l.dir === 'rtl' ? '< ' : '> '}</span>}
                {shown}
              </p>
            )
          })}
        </div>
        <div className="flex justify-end border-t border-primary-foreground/10 px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-primary-foreground/20 px-4 py-1.5 font-mono text-xs hover:bg-primary-foreground/10"
          >
            exit / إغلاق
          </button>
        </div>
      </dialog>
    </>
  )
}
