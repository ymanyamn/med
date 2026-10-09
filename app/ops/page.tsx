import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { OpsRoom } from '@/components/ops/ops-room'
import { getSession } from '@/lib/session'

export const metadata: Metadata = { title: 'غرفة العمليات المركزية | med' }

export default async function OpsPage() {
  const session = await getSession()
  if (session?.role !== 'ops') redirect('/portal')
  return <OpsRoom />
}
