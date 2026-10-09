import type { Metadata } from 'next'
import { ReportTracker } from '@/components/citizen/report-tracker'

export const metadata: Metadata = { title: 'متابعة البلاغ | med' }

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { id } = await params
  const { t } = await searchParams
  return <ReportTracker id={id} token={t ?? ''} />
}
