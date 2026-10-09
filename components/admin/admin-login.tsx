'use client'

import { KeyRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Emblem } from '@/components/emblem'
import { Button } from '@/components/ui/button'
import { sendJSON } from '@/lib/fetcher'
import { fieldClass } from '@/lib/field'
import { cn } from '@/lib/utils'

export function AdminLogin() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await sendJSON('/api/admin/otp', { code })
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
            أدخل كلمة مرور لوحة التحكم للدخول
          </p>
        </div>

        <form onSubmit={login} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
          <label className="flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="size-4" aria-hidden="true" />
              رمز لوحة التحكم
            </span>
            <input
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={cn(fieldClass, 'text-center font-mono tracking-wider')}
              required
              autoFocus
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            الرمز هو الجزء السري الموجود في رابط لوحة التحكم بعد /control/.
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="h-12 rounded-xl text-base">
            {busy ? 'جارٍ التحقق...' : 'دخول آمن'}
          </Button>
        </form>
      </div>
    </main>
  )
}
