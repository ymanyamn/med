'use client'

import { Eye, EyeOff, MapPinned, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { LiveMap } from '@/components/map'
import { StatusBadge } from '@/components/ops/report-list'
import { StaffHeader } from '@/components/staff-header'
import { Button } from '@/components/ui/button'
import { fetcher, formatDateTime, sendJSON } from '@/lib/fetcher'
import { EMERGENCY_LABEL, type Center, type ReportView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CenterForm } from './center-form'
import { SettingsPanel } from './settings-panel'

interface Overview {
  centers: Center[]
  opsPin: string
  reports: ReportView[]
  stats: Record<'total' | 'active' | 'completed' | 'withReport' | 'missingReport' | 'smart', number>
}

const STATS: [keyof Overview['stats'], string][] = [
  ['total', 'إجمالي البلاغات'],
  ['active', 'قيد المعالجة'],
  ['completed', 'مهام منتهية'],
  ['withReport', 'تقارير منجزة'],
  ['missingReport', 'بدون تقرير'],
  ['smart', 'عبر النظام الذكي'],
]

export function AdminDashboard({ email }: { email: string }) {
  const { data, mutate } = useSWR<Overview>('/api/admin/overview', fetcher, { refreshInterval: 5000 })
  const [editing, setEditing] = useState<Center | 'new' | null>(null)
  const [tab, setTab] = useState<'centers' | 'reports' | 'settings'>('centers')
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  async function toggleActive(c: Center) {
    await sendJSON(`/api/admin/centers/${c.id}`, { active: !c.active }, 'PATCH').catch((e) => setError(e.message))
    mutate()
  }

  async function remove(c: Center) {
    if (!confirm(`حذف ${c.name} نهائياً؟`)) return
    setError('')
    await sendJSON(`/api/admin/centers/${c.id}`, undefined, 'DELETE').catch((e) => setError(e.message))
    mutate()
  }

  const centers = data?.centers ?? []

  return (
    <div className="flex min-h-dvh flex-col">
      <StaffHeader title="لوحة التحكم الشاملة" subtitle={email} logoutUrl="/api/admin/settings" />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
        <section aria-label="إحصاءات" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STATS.map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
              <span className={cn('text-2xl font-bold', key === 'missingReport' && (data?.stats[key] ?? 0) > 0 && 'text-destructive')}>
                {data?.stats[key] ?? '—'}
              </span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </section>

        <div role="tablist" className="flex gap-2">
          {(
            [
              ['centers', `المراكز (${centers.length})`],
              ['reports', 'البلاغات'],
              ['settings', 'الإعدادات'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium',
                tab === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {tab === 'centers' && (
          <div className="grid gap-4 lg:grid-cols-[1fr_26rem]">
            <div className="flex flex-col gap-4">
              <div className="h-80 overflow-hidden rounded-2xl border lg:h-[28rem]">
                <LiveMap
                  center={[34.8, 38.0]}
                  zoom={7}
                  follow={false}
                  points={centers
                    .filter((c) => c.active)
                    .map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, kind: 'center' as const, label: c.name }))}
                  onPointClick={(id) => setEditing(centers.find((c) => c.id === id) ?? null)}
                  className="size-full"
                />
              </div>
              {editing && (
                <CenterForm
                  key={editing === 'new' ? 'new' : editing.id}
                  center={editing === 'new' ? null : editing}
                  onClose={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null)
                    mutate()
                  }}
                />
              )}
            </div>

            <section className="flex flex-col gap-3" aria-label="قائمة المراكز">
              <Button onClick={() => setEditing('new')} className="h-11 rounded-xl text-base">
                <Plus aria-hidden="true" />
                إضافة مركز جديد
              </Button>
              <ul className="flex max-h-[40rem] flex-col gap-2 overflow-y-auto">
                {centers.map((c) => (
                  <li key={c.id} className={cn('flex flex-col gap-2 rounded-2xl border bg-card p-3', !c.active && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold">{c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.city} · <span dir="ltr">{c.id}</span>
                        </span>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-xs',
                          c.active ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {c.active ? 'منشور' : 'مخفي'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setRevealed((s) => {
                            const n = new Set(s)
                            n.has(c.id) ? n.delete(c.id) : n.add(c.id)
                            return n
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 font-mono text-xs"
                        aria-label="إظهار رمز دخول المركز"
                      >
                        {revealed.has(c.id) ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                        <span dir="ltr">{revealed.has(c.id) ? c.pin : '••••'}</span>
                      </button>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => toggleActive(c)} aria-label={c.active ? 'إخفاء من الخريطة' : 'نشر على الخريطة'}>
                          <MapPinned />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(c)} aria-label="تعديل">
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(c)} aria-label="حذف" className="text-destructive">
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {tab === 'reports' && (
          <section className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">الرقم</th>
                  <th className="p-3 text-start font-medium">النوع</th>
                  <th className="p-3 text-start font-medium">الوقت</th>
                  <th className="p-3 text-start font-medium">المركز</th>
                  <th className="p-3 text-start font-medium">الحالة</th>
                  <th className="p-3 text-start font-medium">التقرير</th>
                </tr>
              </thead>
              <tbody>
                {(data?.reports ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 font-mono text-xs" dir="ltr">{r.id}</td>
                    <td className="p-3">{EMERGENCY_LABEL[r.type]}</td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</td>
                    <td className="p-3">{r.centerName ?? '—'}</td>
                    <td className="p-3"><StatusBadge status={r.status} /></td>
                    <td className="p-3 text-xs">
                      {r.incidentReport ? 'منجز' : r.status === 'completed' ? <span className="text-destructive">لم يُرسل</span> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.reports.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">لا توجد بلاغات بعد</p>}
          </section>
        )}

        {tab === 'settings' && data && <SettingsPanel opsPin={data.opsPin} onSaved={() => mutate()} />}
      </main>
    </div>
  )
}
