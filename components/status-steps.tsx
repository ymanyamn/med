import { Check } from 'lucide-react'
import { formatTime } from '@/lib/fetcher'
import type { ReportStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const ORDER: ReportStatus[] = ['pending', 'confirmed', 'sent', 'received', 'completed']

export function StatusSteps({
  status,
  times,
}: {
  status: ReportStatus
  times: { sentAt?: number; receivedAt?: number; completedAt?: number }
}) {
  const current = ORDER.indexOf(status)
  const steps = [
    { label: 'تم الإرسال', at: times.sentAt, idx: 2 },
    { label: 'تم الاستلام', at: times.receivedAt, idx: 3 },
    { label: 'تم الانتهاء', at: times.completedAt, idx: 4 },
  ]

  return (
    <ol className="flex items-start" aria-label="حالة الطلب">
      {steps.map((step, i) => {
        const done = current >= step.idx
        const active = current + 1 === step.idx || (current === step.idx && step.idx < 4)
        return (
          <li key={step.label} className="flex flex-1 flex-col items-center gap-2 text-center">
            <div className="flex w-full items-center">
              <span className={cn('h-0.5 flex-1', i === 0 ? 'opacity-0' : done ? 'bg-primary' : 'bg-border')} />
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : active
                      ? 'border-primary bg-card text-primary'
                      : 'border-border bg-card text-muted-foreground',
                )}
              >
                {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
              </span>
              <span
                className={cn(
                  'h-0.5 flex-1',
                  i === steps.length - 1 ? 'opacity-0' : current > step.idx ? 'bg-primary' : 'bg-border',
                )}
              />
            </div>
            <span className={cn('text-sm font-medium', done ? 'text-foreground' : 'text-muted-foreground')}>
              {step.label}
            </span>
            <span className="text-xs text-muted-foreground">{done ? formatTime(step.at) : '—'}</span>
          </li>
        )
      })}
    </ol>
  )
}
