import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Emblem } from '@/components/emblem'
import { DeveloperTerminal } from '@/components/landing/developer-terminal'
import { Typewriter } from '@/components/landing/typewriter'

export default function HomePage() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-2 bg-primary" />

      <header className="flex items-center justify-between px-6 pt-8">
        <div className="flex items-center gap-3">
          <Emblem className="size-11" />
          <div className="leading-tight">
            <p className="font-mono text-2xl font-medium tracking-tight text-primary" dir="ltr">
              med
            </p>
            <p className="text-xs text-muted-foreground">الدفاع المدني السوري</p>
          </div>
        </div>
        <span className="rounded-full border border-primary/30 bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          على مدار الساعة
        </span>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-12 text-center">
        <div className="relative">
          <Emblem className="size-36 md:size-44" />
        </div>

        <div className="flex flex-col items-center gap-4">
          <h1 className="sr-only">رجال الدفاع المدني معك أينما تكون</h1>
          <Typewriter
            text="رجال الدفاع المدني معك أينما تكون"
            className="min-h-[2.6em] max-w-xl text-balance text-3xl font-bold leading-snug text-foreground md:min-h-[1.4em] md:text-5xl"
          />
          <p className="max-w-md text-pretty leading-relaxed text-muted-foreground">
            أرسل بلاغك بضغطة واحدة، وسيصل إلى غرفة العمليات المركزية وأقرب مركز للدفاع المدني فوراً.
          </p>
        </div>

        <Link
          href="/portal"
          className="group inline-flex h-14 w-full max-w-xs items-center justify-center gap-3 rounded-2xl bg-primary px-8 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
        >
          الدخول
          <ArrowLeft className="size-5 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
        </Link>
      </section>

      <footer className="flex flex-col items-center gap-2 px-6 pb-8 text-center">
        <DeveloperTerminal />
        <p className="font-mono text-xs text-muted-foreground/70" dir="ltr">
          M-Code
        </p>
      </footer>
    </main>
  )
}
