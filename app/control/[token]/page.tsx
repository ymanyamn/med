import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { AdminLogin } from '@/components/admin/admin-login'
import { ADMIN_PANEL_TOKEN, getSession, safeEqual } from '@/lib/session'

export const metadata: Metadata = {
  title: 'لوحة التحكم | med',
  robots: { index: false, follow: false },
}

export default async function ControlPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!safeEqual(token, ADMIN_PANEL_TOKEN)) notFound()
  const session = await getSession()
  return session?.role === 'admin' ? <AdminDashboard email={session.email} /> : <AdminLogin />
}
