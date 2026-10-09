import type { Metadata } from 'next'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { AdminLogin } from '@/components/admin/admin-login'
import { getSession } from '@/lib/session'

export const metadata: Metadata = {
  title: 'لوحة التحكم | med',
  robots: { index: false, follow: false },
}

export default async function ControlPage() {
  const session = await getSession()
  return session?.role === 'admin' ? <AdminDashboard email={session.email} /> : <AdminLogin />
}
