'use client'

import { CircleCheck, Home, Loader2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import useSWR from 'swr'
import { Emblem } from '@/components/emblem'
import { EmergencyIcon } from '@/components/emergency-icon'
import { StatusSteps } from '@/components/status-steps'
import { useLiveLocation } from '@/hooks/use-live-location'
import { fetcher, formatTime } from '@/lib/fetcher'
import { EMERGENCY_LABEL, type CitizenReportView } from '@/lib/types'

const MESSAGES: Record<CitizenReportView['status'], string> = {
  pending: 'وصل بلاغك إلى غرفة العمليات المركزية، يتم الآن التحقق منه.',
  confirmed: 'تم تأكيد البلاغ، يتم تحديد أقرب مركز للدفاع المدني إليك.',
  sent: 'تم إرسال البلاغ إلى أقرب مركز، الفريق يستعد للتحرك.',
  received: 'استلم الفريق مهمتك وهو في الطريق إليك. ابقَ في مكان آمن.',
  completed: 'تم إنهاء المهمة. نتمنى لك السلامة.',
}

export function ReportTracker({ id, token }: { id: string; token: string }) {
  const { data, error } = useSWR<CitizenReportView>(
    token ? `/api/reports/${id}?t=${token}` : null,
    fetcher,
    { refreshInterval: (d) => (d?.status === 'completed' ? 0 : 3000) },
  )
  const { location } = useLiveLocation()
  const lastSent = useRef(0)

  useEffect(() => {
    if (!location || data?.status === 'completed') return
    const now = Date.now()
    if (now - lastSent.current < 8000) return
    lastSent.current = now
    fetch(`/api/reports/${id}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...location }),
    }).catch(() => null)
  }, [location, id, token, data?.status])

  if (error || !token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">تعذر العثور على البلاغ</p>
        <Link href="/citizen" className="text-primary underline underline-offset-4">
          إرسال بلاغ جديد
        </Link>
      </main>
    )
  }

  const done = data?.status === 'completed'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-5 py-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Emblem className="size-8" />
          <span className="font-mono text-lg text-primary" dir="ltr">
            med
          </span>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 font-mono text-xs text-muted-foreground" dir="ltr">
          {id}
        </span>
      </header>

      <section className="flex flex-col items-center gap-4 rounded-3xl bg-primary px-6 py-10 text-center text-primary-foreground">
        {done ? (
          <CircleCheck className="size-14" aria-hidden="true" />
        ) : (
          <span className="relative flex size-14 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary-foreground/20" />
            <ShieldCheck className="relative size-12" aria-hidden="true" />
          </span>
        )}
        <h1 className="text-balance text-2xl font-bold">{done ? 'تمت المهمة بنجاح' : 'تم استلام بلاغك'}</h1>
        <p className="text-pretty leading-relaxed text-primary-foreground/85" aria-live="polite">
          {data ? MESSAGES[data.status] : 'جارٍ تحميل حالة البلاغ...'}
        </p>
      </section>

      {data ? (
        <section className="flex flex-col gap-6 rounded-3xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <EmergencyIcon type={data.type} className="size-6" />
            </span>
            <div className="flex flex-col">
              <span className="font-semibold">{EMERGENCY_LABEL[data.type]}</span>
              <span className="text-xs text-muted-foreground">أُرسل الساعة {formatTime(data.createdAt)}</span>
            </div>
          </div>
          <StatusSteps status={data.status} times={data} />
          {data.centerName && (
            <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
              المركز المكلّف: <strong>{data.centerName}</strong>
            </p>
          )}
        </section>
      ) : (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-primary" aria-label="جارٍ التحميل" />
        </div>
      )}

      {!done && (
        <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          <li>• أبقِ هاتفك قريباً منك، قد يتصل بك الفريق.</li>
          <li>• لا تغلق هذه الصفحة لنتمكن من متابعة موقعك.</li>
          <li>• ابتعد عن مصدر الخطر قدر الإمكان.</li>
        </ul>
      )}

      <Link href="/" className="mt-auto inline-flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground">
        <Home className="size-4" aria-hidden="true" />
        الصفحة الرئيسية
      </Link>
    </main>
  )
}
