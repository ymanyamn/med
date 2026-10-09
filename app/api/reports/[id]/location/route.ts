import { findReportForCitizen } from '@/lib/store'
import { fail, num, ok, readBody, str } from '@/lib/http'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await readBody(req)
  const report = findReportForCitizen(id, str(b.token, 64))
  if (!report) return fail('البلاغ غير موجود', 404)
  if (report.status === 'completed') return ok()

  const lat = num(b.lat, -90, 90)
  const lng = num(b.lng, -180, 180)
  if (lat === null || lng === null) return fail('إحداثيات غير صالحة')
  report.location = { lat, lng, accuracy: num(b.accuracy, 0, 100000) ?? undefined, updatedAt: Date.now() }
  return ok()
}
