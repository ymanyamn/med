'use client'

import { X } from 'lucide-react'
import { useState } from 'react'
import { LiveMap } from '@/components/map'
import { Button } from '@/components/ui/button'
import { sendJSON } from '@/lib/fetcher'
import { fieldClass } from '@/lib/field'
import type { Center } from '@/lib/types'

export function CenterForm({
  center,
  onClose,
  onSaved,
}: {
  center: Center | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: center?.name ?? '',
    city: center?.city ?? '',
    phone: center?.phone ?? '',
    pin: '',
    active: center?.active ?? true,
    lat: center?.lat ?? null as number | null,
    lng: center?.lng ?? null as number | null,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (center) await sendJSON(`/api/admin/centers/${center.id}`, form, 'PATCH')
      else await sendJSON('/api/admin/centers', form)
      onSaved()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border-2 border-primary bg-card p-4">
      <header className="flex items-center justify-between">
        <h2 className="font-bold">{center ? `تعديل: ${center.name}` : 'إضافة مركز جديد'}</h2>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="إغلاق">
          <X />
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">اسم المركز (التسمية)</span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={fieldClass} required minLength={3} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">المدينة / المحافظة</span>
          <input value={form.city} onChange={(e) => set('city', e.target.value)} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">هاتف المركز</span>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={fieldClass} dir="ltr" inputMode="tel" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{center ? 'رمز دخول جديد (اتركه فارغاً للإبقاء)' : 'رمز الدخول (فارغ = توليد تلقائي)'}</span>
          <input
            value={form.pin}
            onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 8))}
            className={fieldClass}
            dir="ltr"
            inputMode="numeric"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          موقع المركز على الخريطة{' '}
          <span className="font-normal text-muted-foreground">(اضغط على الخريطة لتحديد الموقع)</span>
        </span>
        <div className="h-64 overflow-hidden rounded-xl border">
          <LiveMap
            center={form.lat !== null && form.lng !== null ? [form.lat, form.lng] : [34.8, 38.0]}
            zoom={form.lat !== null ? 12 : 7}
            follow={false}
            points={form.lat !== null && form.lng !== null ? [{ id: 'pick', lat: form.lat, lng: form.lng, kind: 'selected' }] : []}
            onPick={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
            className="size-full"
          />
        </div>
        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
          {form.lat !== null && form.lng !== null ? `${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}` : '—'}
        </span>
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => set('active', e.target.checked)}
          className="size-5 accent-[var(--primary)]"
        />
        <span className="text-sm font-medium">نشر المركز على الخريطة وتفعيله لاستقبال البلاغات</span>
      </label>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="h-11 flex-1 rounded-xl text-base">
          {busy ? 'جارٍ الحفظ...' : 'حفظ'}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} className="h-11 rounded-xl px-6">
          إلغاء
        </Button>
      </div>
    </form>
  )
}
