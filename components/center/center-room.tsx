'use client'

import { Bell } from 'lucide-react'
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { StaffHeader } from '@/components/staff-header'
import { Button } from '@/components/ui/button'
import { requestNotificationPermission, useNewItemAlert } from '@/hooks/use-alerts'
import { fetcher } from '@/lib/fetcher'
import type { PublicCenter, ReportView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MissionCard } from './mission-card'

interface CenterData {
  now: number
  center: PublicCenter
  reports: ReportView[]
}

export function CenterRoom() {
  const { data, mutate, error } = useSWR<CenterData>('/api/center/reports', fetcher, { refreshInterval: 2500 })
  const [tab, setTab] = useState<'active' | 'done'>('active')

  const reports = data?.reports
  const active = useMemo(() => reports?.filter((r) => r.status !== 'completed') ?? [], [reports])
  const done = useMemo(() => reports?.filter((r) => r.status === 'completed') ?? [], [reports])
  const missing = done.filter((r) => !r.incidentReport).length

  useNewItemAlert(
    reports?.map((r) => r.id),
    'مهمة جديدة من غرفة العمليات المركزية',
  )

  const list = tab === 'active' ? active : done

  return (
    <div className="flex min-h-dvh flex-col">
      <StaffHeader title={data?.center.name ?? 'غرفة العمليات الفرعية'} subtitle={data?.center.city}>
        <Button variant="outline" size="sm" onClick={requestNotificationPermission} className="hidden sm:inline-flex">
          <Bell aria-hidden="true" />
          تفعيل الإشعارات
        </Button>
      </StaffHeader>

      {error && (
        <p role="alert" className="bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground">
          انقطع الاتصال بالخادم، تتم إعادة المحاولة...
        </p>
      )}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-4">
        <div role="tablist" className="flex gap-2">
          <button
            role="tab"
            aria-selected={tab === 'active'}
            onClick={() => setTab('active')}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium',
              tab === 'active' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            المهام الحالية ({active.length})
          </button>
          <button
            role="tab"
            aria-selected={tab === 'done'}
            onClick={() => setTab('done')}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium',
              tab === 'done' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            المنتهية
            {missing > 0 && (
              <span className="ms-2 rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">{missing}</span>
            )}
          </button>
        </div>

        {!data ? (
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        ) : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
            {tab === 'active' ? 'لا توجد مهام حالياً. ستظهر المهام الجديدة هنا فور إرسالها.' : 'لا توجد مهام منتهية بعد'}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {list.map((r) => (
              <li key={r.id}>
                <MissionCard report={r} onChange={() => mutate()} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
