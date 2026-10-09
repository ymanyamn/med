'use client'

import { EmergencyIcon } from '@/components/emergency-icon'
import { formatTime } from '@/lib/fetcher'
import { EMERGENCY_LABEL, STATUS_LABEL, type ReportStatus, type ReportView } from '@/lib/types'
import { cn } from '@/lib/utils'

export const STATUS_TONE: Record<ReportStatus, string> = {
  pending: 'bg-destructive text-destructive-foreground',
  confirmed: 'bg-destructive/10 text-destructive',
  sent: 'bg-secondary text-secondary-foreground',
  received: 'bg-primary/15 text-primary',
  completed: 'bg-primary text-primary-foreground',
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_TONE[status])}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function ReportList({
  reports,
  selectedId,
  onSelect,
  loading,
}: {
  reports: ReportView[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
}) {
  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-muted" aria-label="جارٍ التحميل" />
  }
  if (reports.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        لا توجد بلاغات نشطة حالياً
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="البلاغات">
      {reports.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect(r.id)}
            aria-current={selectedId === r.id}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-start transition hover:border-primary/40',
              selectedId === r.id && 'border-primary ring-2 ring-primary/20',
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <EmergencyIcon type={r.type} className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{EMERGENCY_LABEL[r.type]}</span>
                <span className="text-xs text-muted-foreground">{formatTime(r.createdAt)}</span>
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">{r.centerName ?? 'لم يُحدد مركز'}</span>
                <StatusBadge status={r.status} />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
