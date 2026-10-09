import type { Metadata } from 'next'
import { ReportForm } from '@/components/citizen/report-form'

export const metadata: Metadata = { title: 'إرسال بلاغ طارئ | med' }

export default function CitizenPage() {
  return <ReportForm />
}
