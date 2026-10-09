'use client'

import { useState } from 'react'
import { EmergencyIcon } from '@/components/emergency-icon'
import { formatDateTime } from '@/lib/fetcher'
import { EMERGENCY_LABEL, type ReportView } from '@/lib/types'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'done' | 'missing'

export function ReportsLog({ reports }: { reports: ReportView[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const completed = reports.filter((r) => r.status === 'completed')
  const withReport = completed.filter((r) => r.incidentReport)
  const missing = completed.filter((r) => !r.incidentReport)
  const list = filter === 'done' ? withReport : filter === 'missing' ? missing : completed

  const filters: [Filter, string, number][] = [
    ['all', 'كل المهام المنتهية', completed.length],
    ['done', 'تقرير منجز', withReport.length],
    ['missing', 'لم يتم إرسال تقرير', missing.length],
  ]

  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {filters.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              'flex flex-col items-start gap-1 rounded-2xl border bg-card p-4 text-start transition',
              filter === key && 'border-primary ring-2 ring-primary/20',
            )}
          >
            <span className={cn('text-2xl font-bold', key === 'missing' && count > 0 && 'text-destructive')}>{count}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لا توجد سجلات</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <EmergencyIcon type={r.type} className="size-5 text-destructive" />
                  <span className="font-semibold">{EMERGENCY_LABEL[r.type]}</span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {r.id}
                  </span>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium',
                    r.incidentReport ? 'bg-primary text-primary-foreground' : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {r.incidentReport ? 'تقرير منجز' : 'لم يتم إرسال تقرير'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.centerName} · انتهت {formatDateTime(r.completedAt)}
              </p>
              {r.incidentReport && <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.incidentReport}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
