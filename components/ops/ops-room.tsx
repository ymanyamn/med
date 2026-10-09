'use client'

import { Bell, Inbox } from 'lucide-react'
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { StaffHeader } from '@/components/staff-header'
import { Button } from '@/components/ui/button'
import { requestNotificationPermission, useNewItemAlert } from '@/hooks/use-alerts'
import { fetcher } from '@/lib/fetcher'
import type { PublicCenter, ReportView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { IncomingAlert } from './incoming-alert'
import { ReportDetail } from './report-detail'
import { ReportList } from './report-list'
import { ReportsLog } from './reports-log'

export interface OpsData {
  now: number
  reports: ReportView[]
  centers: PublicCenter[]
}

export function OpsRoom() {
  const { data, mutate, error } = useSWR<OpsData>('/api/ops/reports', fetcher, { refreshInterval: 2500 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'log'>('active')

  const reports = data?.reports
  const pending = useMemo(() => reports?.filter((r) => r.status === 'pending') ?? [], [reports])
  const active = useMemo(() => reports?.filter((r) => r.status !== 'completed') ?? [], [reports])
  const offset = data ? data.now - Date.now() : 0

  useNewItemAlert(
    reports?.map((r) => r.id),
    'بلاغ طارئ جديد - غرفة العمليات',
  )

  const selected = reports?.find((r) => r.id === selectedId) ?? null

  return (
    <div className="flex min-h-dvh flex-col">
      <StaffHeader title="غرفة العمليات المركزية" subtitle="الدفاع المدني السوري - med">
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

      {pending.length > 0 && (
        <section aria-label="بلاغات واردة" className="border-b bg-destructive/5">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4">
            {pending.map((r) => (
              <IncomingAlert
                key={r.id}
                report={r}
                offset={offset}
                onDone={(confirmed) => {
                  mutate()
                  if (confirmed) {
                    setSelectedId(r.id)
                    setTab('active')
                  }
                }}
              />
            ))}
          </div>
        </section>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4">
        <div role="tablist" className="flex gap-2">
          {(
            [
              ['active', `البلاغات النشطة (${active.length})`],
              ['log', 'السجل والتقارير'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition',
                tab === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'active' ? (
          <div className="grid flex-1 gap-4 lg:grid-cols-[22rem_1fr]">
            <ReportList reports={active} selectedId={selectedId} onSelect={setSelectedId} loading={!data} />
            {selected ? (
              <ReportDetail key={selected.id} report={selected} onChange={() => mutate()} />
            ) : (
              <div className="hidden flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground lg:flex">
                <Inbox className="size-10" aria-hidden="true" />
                <p>اختر بلاغاً من القائمة لعرض التفاصيل والموقع المباشر</p>
              </div>
            )}
          </div>
        ) : (
          <ReportsLog reports={reports ?? []} />
        )}
      </div>
    </div>
  )
}
