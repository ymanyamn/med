import { ArrowRight, Siren } from 'lucide-react'
import Link from 'next/link'
import { Emblem } from '@/components/emblem'
import { StaffLogin } from '@/components/portal/staff-login'
import { db } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default function PortalPage() {
  const centers = db.centers.filter((c) => c.active).map(({ id, name, city }) => ({ id, name, city }))

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-8 px-5 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" aria-hidden="true" />
          الرئيسية
        </Link>
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg text-primary" dir="ltr">
            med
          </span>
          <Emblem className="size-8" />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h1 className="text-balance text-2xl font-bold">كيف يمكننا مساعدتك؟</h1>
        <Link
          href="/citizen"
          className="group flex items-center gap-4 rounded-2xl bg-destructive p-5 text-destructive-foreground shadow-lg shadow-destructive/20 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-destructive/40"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-destructive-foreground/15">
            <Siren className="size-7" aria-hidden="true" />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-xl font-bold">أنا مواطن - إرسال بلاغ طارئ</span>
            <span className="text-sm leading-relaxed text-destructive-foreground/85">
              حريق، حادث، انهيار، إسعاف وكل ما يخص الدفاع المدني
            </span>
          </span>
        </Link>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="staff-heading">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <h2 id="staff-heading" className="text-sm font-medium text-muted-foreground">
            دخول الكوادر
          </h2>
          <span className="h-px flex-1 bg-border" />
        </div>
        <StaffLogin centers={centers} />
      </section>
    </main>
  )
}
