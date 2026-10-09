import { cn } from '@/lib/utils'

export function Emblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn('size-10', className)} aria-hidden="true">
      <circle cx="50" cy="50" r="48" className="fill-primary" />
      <circle cx="50" cy="50" r="38" className="fill-primary-foreground" />
      <polygon points="50,20 78,68 22,68" className="fill-primary" />
    </svg>
  )
}
