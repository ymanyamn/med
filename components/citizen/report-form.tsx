'use client'

import { ArrowRight, MapPin, Send } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { EmergencyIcon } from '@/components/emergency-icon'
import { useLiveLocation } from '@/hooks/use-live-location'
import { sendJSON } from '@/lib/fetcher'
import { fieldClass, textareaClass } from '@/lib/field'
import { EMERGENCY_TYPES, type EmergencyType } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ReportForm() {
  const router = useRouter()
  const { location, state } = useLiveLocation()
  const [type, setType] = useState<EmergencyType | null>(null)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const needsAddress = state === 'denied' || state === 'unavailable'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!type) {
      setError('يرجى اختيار نوع الحالة')
      return
    }
    setError('')
    setSending(true)
    try {
      const res = await sendJSON<{ id: string; token: string }>('/api/reports', {
        type,
        phone,
        name,
        description,
        address,
        location,
      })
      router.push(`/citizen/track/${res.id}?t=${res.token}`)
    } catch (err) {
      setError((err as Error).message)
      setSending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-5 pb-32 pt-6">
      <header className="flex items-center justify-between">
        <Link href="/portal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" aria-hidden="true" />
          رجوع
        </Link>
        <span className="font-mono text-lg text-primary" dir="ltr">
          med
        </span>
      </header>

      <div className="flex flex-col gap-1">
        <h1 className="text-balance text-2xl font-bold">بلاغ طارئ</h1>
        <p className="text-pretty leading-relaxed text-muted-foreground">
          اختر نوع الحالة وأدخل رقم هاتفك، وسنصل إليك بأسرع وقت.
        </p>
      </div>

      <form id="report-form" onSubmit={submit} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-semibold">نوع الحالة</legend>
          <div className="grid grid-cols-3 gap-2">
            {EMERGENCY_TYPES.map((t) => {
              const selected = type === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setType(t.key)}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 p-2 text-center text-sm font-medium transition',
                    selected
                      ? 'border-destructive bg-destructive text-destructive-foreground'
                      : 'border-border bg-card text-foreground hover:border-primary/50',
                  )}
                >
                  <EmergencyIcon type={t.key} className="size-7" />
                  <span className="leading-tight">{t.label}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">رقم الهاتف</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xx xxx xxx"
            className={cn(fieldClass, 'text-end')}
            required
          />
        </label>

        {needsAddress && (
          <label className="flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="size-4 text-destructive" aria-hidden="true" />
              العنوان بالتفصيل
            </span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="المدينة، الحي، الشارع، أقرب معلم"
              className={fieldClass}
              required
              minLength={3}
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              لم نتمكن من تحديد موقعك تلقائياً. يمكنك أيضاً تفعيل خدمة الموقع من إعدادات المتصفح.
            </span>
          </label>
        )}

        <details className="group rounded-2xl border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:hidden">
            معلومات إضافية (اختياري)
          </summary>
          <div className="flex flex-col gap-4 px-4 pb-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">الاسم</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} autoComplete="name" />
            </label>
            {!needsAddress && (
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">وصف العنوان</span>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="الطابق، أقرب معلم..."
                  className={fieldClass}
                />
              </label>
            )}
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">وصف الحالة</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="عدد المصابين، وجود عالقين، تفاصيل مهمة..."
                className={textareaClass}
              />
            </label>
          </div>
        </details>

        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </form>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <button
            type="submit"
            form="report-form"
            disabled={sending}
            className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-destructive text-xl font-bold text-destructive-foreground shadow-lg shadow-destructive/25 transition active:scale-[0.99] disabled:opacity-60"
          >
            <Send className="size-6 -scale-x-100" aria-hidden="true" />
            {sending ? 'جارٍ الإرسال...' : 'إرسال البلاغ'}
          </button>
        </div>
      </div>
    </main>
  )
}
