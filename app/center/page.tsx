import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CenterRoom } from '@/components/center/center-room'
import { getSession } from '@/lib/session'

export const metadata: Metadata = { title: 'غرفة العمليات الفرعية | med' }

export default async function CenterPage() {
  const session = await getSession()
  if (session?.role !== 'center') redirect('/portal')
  return <CenterRoom />
}
