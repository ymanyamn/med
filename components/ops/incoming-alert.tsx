'use client'

import { BrainCircuit, Check, Phone } from 'lucide-react'
import { useState } from 'react'
import { EmergencyIcon } from '@/components/emergency-icon'
import { Button } from '@/components/ui/button'
import { useTicker } from '@/hooks/use-alerts'
import { sendJSON } from '@/lib/fetcher'
import { EMERGENCY_LABEL, SMART_TIMEOUT_MS, type ReportView } from '@/lib/types'

export function IncomingAlert({
  report,
  offset,
  onDone,
}: {
  report: ReportView
  offset: number
  onDone: (confirmed: boolean) => void
}) {
  const now = useTicker(250) + offset
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remainingMs = Math.max(0, SMART_TIMEOUT_MS - (now - report.createdAt))
  const seconds = Math.ceil(remainingMs / 1000)
  const progress = remainingMs / SMART_TIMEOUT_MS

  async function act(action: 'confirm' | 'smart') {
    setBusy(true)
    setError('')
    try {
      await sendJSON(`/api/ops/reports/${report.id}`, { action })
      onDone(action === 'confirm')
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const R = 22
  const C = 2 * Math.PI * R

  return (
    <article
      role="alert"
      className="flex flex-col gap-4 rounded-2xl border-2 border-destructive bg-card p-4 shadow-lg shadow-destructive/10 sm:flex-row sm:items-center"
    >
      <div className="flex flex-1 items-center gap-4">
        <div className="relative size-14 shrink-0" aria-label={`متبقي ${seconds} ثانية قبل التحويل للنظام الذكي`}>
          <svg viewBox="0 0 50 50" className="size-14 -rotate-90" aria-hidden="true">
            <circle cx="25" cy="25" r={R} className="fill-none stroke-destructive/15" strokeWidth="4" />
            <circle
              cx="25"
              cy="25"
              r={R}
              className="fill-none stroke-destructive transition-[stroke-dashoffset] duration-200"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-lg font-bold text-destructive">
            {seconds}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <EmergencyIcon type={report.type} className="size-5 text-destructive" />
            <span className="font-bold">بلاغ جديد: {EMERGENCY_LABEL[report.type]}</span>
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">
              {report.id}
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1" dir="ltr">
              <Phone className="size-3.5" aria-hidden="true" />
              {report.phone}
            </span>
            <span>{report.location ? 'الموقع المباشر متوفر' : `العنوان: ${report.address}`}</span>
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button onClick={() => act('confirm')} disabled={busy} className="h-11 rounded-xl px-5 text-base">
          <Check aria-hidden="true" />
          تأكيد
        </Button>
        <Button
          variant="outline"
          onClick={() => act('smart')}
          disabled={busy || !report.location}
          className="h-11 rounded-xl px-5 text-base"
          title={report.location ? 'إرسال تلقائي لأقرب مركز' : 'يتطلب موقع المبلغ'}
        >
          <BrainCircuit aria-hidden="true" />
          النظام الذكي
        </Button>
      </div>
    </article>
  )
}
