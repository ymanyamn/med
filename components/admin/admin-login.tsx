'use client'

import { KeyRound, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Emblem } from '@/components/emblem'
import { Button } from '@/components/ui/button'
import { sendJSON } from '@/lib/fetcher'
import { fieldClass } from '@/lib/field'
import { cn } from '@/lib/utils'

export function AdminLogin() {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [info, setInfo] = useState('')
  const [devCode, setDevCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await sendJSON<{ message: string; devCode?: string }>('/api/admin/otp', { step: 'request', email })
      setInfo(res.message)
      setDevCode(res.devCode ?? '')
      setStep('code')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await sendJSON('/api/admin/otp', { step: 'verify', email, code })
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Emblem className="size-14" />
          <h1 className="text-xl font-bold">لوحة التحكم الإدارية</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {step === 'email' ? 'أدخل البريد الإلكتروني المخوّل لاستلام رمز الدخول' : info}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={requestCode} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
            <label className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Mail className="size-4" aria-hidden="true" />
                البريد الإلكتروني
              </span>
              <input
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={cn(fieldClass, 'text-start')}
                required
              />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="h-12 rounded-xl text-base">
              {busy ? 'جارٍ الإرسال...' : 'إرسال رمز الدخول'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
            <label className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4" aria-hidden="true" />
                رمز الدخول (6 أرقام)
              </span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={cn(fieldClass, 'text-center font-mono text-2xl tracking-[0.5em]')}
                required
                minLength={6}
                autoFocus
              />
            </label>
            {devCode && (
              <p className="rounded-lg bg-secondary px-3 py-2 text-xs leading-relaxed text-secondary-foreground">
                وضع المعاينة (خدمة البريد غير مفعلة): الرمز هو{' '}
                <span className="font-mono font-bold" dir="ltr">
                  {devCode}
                </span>
              </p>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="h-12 rounded-xl text-base">
              {busy ? 'جارٍ التحقق...' : 'دخول'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep('email')
                setCode('')
                setError('')
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              تغيير البريد أو إعادة الإرسال
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
