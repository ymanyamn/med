'use client'

import { CheckCheck, FileText, Flag, MapPin, Navigation, Phone } from 'lucide-react'
import { useState } from 'react'
import { EmergencyIcon } from '@/components/emergency-icon'
import { LiveMap } from '@/components/map'
import { StatusBadge } from '@/components/ops/report-list'
import { StatusSteps } from '@/components/status-steps'
import { Button } from '@/components/ui/button'
import { formatDateTime, sendJSON } from '@/lib/fetcher'
import { textareaClass } from '@/lib/field'
import { EMERGENCY_LABEL, type ReportView } from '@/lib/types'
import { cn } from '@/lib/utils'

export function MissionCard({ report, onChange }: { report: ReportView; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')

  async function act(body: object) {
    setBusy(true)
    setError('')
    try {
      await sendJSON(`/api/center/reports/${report.id}`, body)
      onChange()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const isNew = report.status === 'sent'
  const loc = report.location

  return (
    <article
      className={cn(
        'flex flex-col gap-4 rounded-2xl border bg-card p-4',
        isNew && 'border-2 border-destructive shadow-lg shadow-destructive/10',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <EmergencyIcon type={report.type} className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold">
              {isNew ? 'مهمة جديدة: ' : ''}
              {EMERGENCY_LABEL[report.type]}
            </h2>
            <p className="font-mono text-xs text-muted-foreground" dir="ltr">
              {report.id} · {formatDateTime(report.sentAt)}
            </p>
          </div>
        </div>
        <StatusBadge status={report.status} />
      </header>

      <div className="flex flex-wrap gap-2 text-sm">
        <a
          href={`tel:${report.phone}`}
          className="inline-flex items-center gap-2 rounded-xl bg-muted px-3 py-2 font-medium text-primary"
          dir="ltr"
        >
          <Phone className="size-4" aria-hidden="true" />
          {report.phone}
        </a>
        {loc && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-muted px-3 py-2 font-medium text-primary"
          >
            <Navigation className="size-4" aria-hidden="true" />
            الملاحة إلى الموقع
          </a>
        )}
        {(report.address || report.description) && (
          <p className="flex w-full items-start gap-2 rounded-xl bg-muted px-3 py-2 leading-relaxed">
            <MapPin className="mt-1 size-4 shrink-0 text-destructive" aria-hidden="true" />
            {[report.name, report.address, report.description].filter(Boolean).join(' — ')}
          </p>
        )}
      </div>

      {loc && report.status !== 'completed' && (
        <div className="h-56 overflow-hidden rounded-xl border">
          <LiveMap
            center={[loc.lat, loc.lng]}
            zoom={15}
            points={[{ id: 'citizen', lat: loc.lat, lng: loc.lng, kind: 'citizen', label: 'موقع المبلغ' }]}
            className="size-full"
          />
        </div>
      )}

      <StatusSteps status={report.status} times={report} />

      {report.status === 'sent' && (
        <Button onClick={() => act({ action: 'receive' })} disabled={busy} className="h-14 rounded-xl text-lg">
          <CheckCheck aria-hidden="true" />
          تم الاستلام
        </Button>
      )}

      {report.status === 'received' && (
        <Button
          onClick={() => act({ action: 'complete' })}
          disabled={busy}
          variant="outline"
          className="h-14 rounded-xl border-primary text-lg text-primary"
        >
          <Flag aria-hidden="true" />
          إنهاء المهمة
        </Button>
      )}

      {report.status === 'completed' &&
        (report.incidentReport ? (
          <section className="flex flex-col gap-2 rounded-xl bg-secondary p-4 text-secondary-foreground">
            <h3 className="flex items-center gap-2 font-semibold">
              <FileText className="size-4" aria-hidden="true" />
              تقرير الحادثة - منجز
            </h3>
            <p className="whitespace-pre-wrap leading-relaxed">{report.incidentReport}</p>
          </section>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              act({ action: 'report', text })
            }}
          >
            <label className="flex flex-col gap-2">
              <span className="flex items-center gap-2 font-semibold">
                <FileText className="size-4" aria-hidden="true" />
                تقرير الحادثة
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-normal text-destructive">
                  لم يتم إرسال تقرير
                </span>
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                minLength={10}
                maxLength={4000}
                required
                placeholder="وصف ما حدث، عدد المصابين، الأضرار، الإجراءات المتخذة، الفرق المشاركة..."
                className={textareaClass}
              />
            </label>
            <Button type="submit" disabled={busy} className="h-12 rounded-xl text-base">
              إرسال التقرير إلى المركزية
            </Button>
          </form>
        ))}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </article>
  )
}
