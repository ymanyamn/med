'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { sendJSON } from '@/lib/fetcher'
import { fieldClass } from '@/lib/field'
import { cn } from '@/lib/utils'

export function SettingsPanel({ opsPin, onSaved }: { opsPin: string; onSaved: () => void }) {
  const [pin, setPin] = useState(opsPin)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await sendJSON('/api/admin/settings', { opsPin: pin }, 'PATCH')
      setMsg({ ok: true, text: 'تم حفظ رمز غرفة العمليات المركزية' })
      onSaved()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <form onSubmit={save} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
        <h2 className="font-bold">رمز دخول غرفة العمليات المركزية</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          يستخدمه مشغلو غرفة العمليات المركزية للدخول من صفحة البوابة.
        </p>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          className={cn(fieldClass, 'text-center font-mono text-xl tracking-[0.4em]')}
          dir="ltr"
          inputMode="numeric"
          minLength={4}
          required
        />
        {msg && <p className={cn('text-sm', msg.ok ? 'text-primary' : 'text-destructive')}>{msg.text}</p>}
        <Button type="submit" disabled={busy} className="h-11 rounded-xl text-base">
          حفظ
        </Button>
      </form>

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 text-sm leading-relaxed">
        <h2 className="font-bold">أمان لوحة التحكم</h2>
        <p className="text-muted-foreground">
          الدخول يتم عبر رمز لمرة واحدة يُرسل إلى بريد المدير فقط، وصلاحيته 10 دقائق مع حد أقصى 5 محاولات.
        </p>
        <p className="text-muted-foreground">
          رابط اللوحة مشفّر ولا يظهر في أي مكان داخل التطبيق. لا تشاركه مع أحد.
        </p>
      </div>
    </section>
  )
}
