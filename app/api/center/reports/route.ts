import { centerReports, getCenter, toPublicCenter } from '@/lib/store'
import { fail, ok, requireRole } from '@/lib/http'

export async function GET() {
  const s = await requireRole('center')
  const center = s && getCenter(s.centerId)
  if (!s || !center) return fail('غير مصرح', 401)
  return ok({ now: Date.now(), center: toPublicCenter(center), reports: centerReports(center.id) })
}
