'use client'

import { BrainCircuit, Building, FileText, MapPin, Phone, Send } from 'lucide-react'
import { useState } from 'react'
import { EmergencyIcon } from '@/components/emergency-icon'
import { LiveMap, type MapPoint } from '@/components/map'
import { StatusSteps } from '@/components/status-steps'
import { Button } from '@/components/ui/button'
import { useTicker } from '@/hooks/use-alerts'
import { formatDateTime, sendJSON } from '@/lib/fetcher'
import { EMERGENCY_LABEL, type ReportView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { StatusBadge } from './report-list'

export function ReportDetail({ report, onChange }: { report: ReportView; onChange: () => void }) {
  const [choice, setChoice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const now = useTicker(5000)

  const choosing = report.status === 'confirmed' || report.status === 'pending'
  const selectedCenter = choice ?? report.nearest?.[0]?.center.id ?? null

  async function act(body: object) {
    setBusy(true)
    setError('')
    try {
      await sendJSON(`/api/ops/reports/${report.id}`, body)
      onChange()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const points: MapPoint[] = []
  if (choosing) {
    report.nearest?.forEach(({ center }) =>
      points.push({
        id: center.id,
        lat: center.lat,
        lng: center.lng,
        kind: center.id === selectedCenter ? 'selected' : 'center',
        label: center.name,
      }),
    )
  }
  if (report.location) {
    points.push({ id: 'citizen', lat: report.location.lat, lng: report.location.lng, kind: 'citizen', label: 'موقع المبلغ' })
  }

  const locationAge = report.location ? Math.round((now - report.location.updatedAt) / 1000) : null

  return (
    <article className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <EmergencyIcon type={report.type} className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold">{EMERGENCY_LABEL[report.type]}</h2>
            <p className="font-mono text-xs text-muted-foreground" dir="ltr">
              {report.id} · {formatDateTime(report.createdAt)}
            </p>
          </div>
        </div>
        <StatusBadge status={report.status} />
      </header>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-xl bg-muted p-3">
          <dt className="text-xs text-muted-foreground">المبلغ</dt>
          <dd className="flex items-center justify-between gap-2">
            <span>{report.name || 'غير محدد'}</span>
            <a href={`tel:${report.phone}`} className="inline-flex items-center gap-1 font-medium text-primary" dir="ltr">
              <Phone className="size-3.5" aria-hidden="true" />
              {report.phone}
            </a>
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted p-3">
          <dt className="text-xs text-muted-foreground">الموقع</dt>
          <dd className="flex items-center gap-1">
            <MapPin className="size-3.5 text-destructive" aria-hidden="true" />
            {report.location ? (
              <span dir="ltr" className="font-mono text-xs">
                {report.location.lat.toFixed(5)}, {report.location.lng.toFixed(5)}
                {locationAge !== null && locationAge < 30 ? ' · LIVE' : ''}
              </span>
            ) : (
              <span>{report.address || 'غير متوفر'}</span>
            )}
          </dd>
        </div>
        {(report.description || (report.location && report.address)) && (
          <div className="flex flex-col gap-1 rounded-xl bg-muted p-3 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">التفاصيل</dt>
            <dd className="leading-relaxed">
              {[report.address, report.description].filter(Boolean).join(' — ')}
            </dd>
          </div>
        )}
      </dl>

      {report.location && (
        <div className="h-64 overflow-hidden rounded-xl border md:h-80">
          <LiveMap
            center={[report.location.lat, report.location.lng]}
            zoom={choosing ? 11 : 15}
            points={points}
            onPointClick={choosing ? (id) => id !== 'citizen' && setChoice(id) : undefined}
            className="size-full"
          />
        </div>
      )}

      {report.status === 'pending' && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          يرجى تأكيد البلاغ من الإشعار أعلاه أو استخدام النظام الذكي.
        </p>
      )}

      {report.status === 'confirmed' && (
        <section className="flex flex-col gap-3" aria-labelledby="nearest-heading">
          <h3 id="nearest-heading" className="flex items-center gap-2 font-semibold">
            <Building className="size-4 text-primary" aria-hidden="true" />
            أقرب مراكز الدفاع المدني
          </h3>
          {report.nearest?.length ? (
            <ul className="flex flex-col gap-2" role="radiogroup" aria-labelledby="nearest-heading">
              {report.nearest.map(({ center, distanceKm }, i) => (
                <li key={center.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedCenter === center.id}
                    onClick={() => setChoice(center.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-start transition',
                      selectedCenter === center.id ? 'border-primary bg-secondary' : 'hover:border-primary/40',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          'size-4 rounded-full border-2',
                          selectedCenter === center.id ? 'border-primary bg-primary' : 'border-input',
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex flex-col">
                        <span className="font-medium">{center.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {center.city}
                          {i === 0 ? ' · الأقرب' : ''}
                        </span>
                      </span>
                    </span>
                    <span className="font-mono text-sm text-muted-foreground">{distanceKm.toFixed(1)} كم</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              لا يتوفر موقع مباشر للمبلغ. اتصل بالمبلغ لتحديد العنوان ثم استخدم النظام الذكي عند توفر الموقع.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => selectedCenter && act({ action: 'assign', centerId: selectedCenter })}
              disabled={busy || !selectedCenter}
              className="h-11 rounded-xl text-base"
            >
              <Send className="-scale-x-100" aria-hidden="true" />
              إرسال
            </Button>
            <Button
              variant="outline"
              onClick={() => act({ action: 'smart' })}
              disabled={busy || !report.location}
              className="h-11 rounded-xl text-base"
            >
              <BrainCircuit aria-hidden="true" />
              النظام الذكي
            </Button>
          </div>
        </section>
      )}

      {(report.status === 'sent' || report.status === 'received' || report.status === 'completed') && (
        <section className="flex flex-col gap-4 rounded-xl border p-4" aria-label="حالة الطلب">
          <p className="text-sm">
            المركز المكلّف: <strong>{report.centerName}</strong>
            {report.assignedBy === 'smart' && (
              <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                عبر النظام الذكي
              </span>
            )}
          </p>
          <StatusSteps status={report.status} times={report} />
        </section>
      )}

      {report.status === 'completed' && (
        <section className="flex flex-col gap-2 rounded-xl bg-muted p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <FileText className="size-4" aria-hidden="true" />
            تقرير الحادثة
          </h3>
          {report.incidentReport ? (
            <p className="whitespace-pre-wrap leading-relaxed">{report.incidentReport}</p>
          ) : (
            <p className="text-sm text-destructive">لم يتم إرسال تقرير بعد</p>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </article>
  )
}
