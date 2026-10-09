'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Emblem } from './emblem'
import { Button } from './ui/button'
import { sendJSON } from '@/lib/fetcher'

export function StaffHeader({
  title,
  subtitle,
  logoutUrl = '/api/auth/staff',
  children,
}: {
  title: string
  subtitle?: string
  logoutUrl?: string
  children?: React.ReactNode
}) {
  const router = useRouter()
  async function logout() {
    await sendJSON(logoutUrl, undefined, 'DELETE').catch(() => null)
    router.replace('/portal')
    router.refresh()
  }
  return (
    <header className="sticky top-0 z-[1000] border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Emblem className="size-9 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight">{title}</h1>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {children}
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut aria-hidden="true" />
            خروج
          </Button>
        </div>
      </div>
    </header>
  )
}
