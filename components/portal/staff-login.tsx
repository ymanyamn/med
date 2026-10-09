'use client'

import { Building, RadioTower } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { sendJSON } from '@/lib/fetcher'
import { fieldClass } from '@/lib/field'
import { cn } from '@/lib/utils'

type Role = 'ops' | 'center'

export function StaffLogin({ centers }: { centers: { id: string; name: string; city: string }[] }) {
  const router = useRouter()
  const [role, setRole] = useState<Role>('ops')
  const [centerId, setCenterId] = useState(centers[0]?.id ?? '')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await sendJSON<{ redirect: string }>('/api/auth/staff', { role, centerId, pin })
      router.push(res.redirect)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const tabs: { key: Role; label: string; icon: typeof RadioTower }[] = [
    { key: 'ops', label: 'غرفة العمليات المركزية', icon: RadioTower },
    { key: 'center', label: 'غرفة عمليات فرعية', icon: Building },
  ]

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <div role="tablist" aria-label="نوع الحساب" className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={role === t.key}
            onClick={() => {
              setRole(t.key)
              setError('')
            }}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-sm font-medium transition',
              role === t.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      {role === 'center' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">المركز</span>
          <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className={fieldClass} required>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">رمز الدخول</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          className={cn(fieldClass, 'text-center font-mono tracking-[0.5em]')}
          placeholder="••••"
          required
          minLength={4}
          dir="ltr"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="h-12 rounded-xl text-base">
        {loading ? 'جارٍ التحقق...' : 'دخول'}
      </Button>
    </form>
  )
}
