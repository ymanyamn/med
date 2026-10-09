import { db, opsReports, toPublicCenter } from '@/lib/store'
import { fail, ok, requireRole } from '@/lib/http'

export async function GET() {
  if (!(await requireRole('ops'))) return fail('غير مصرح', 401)
  return ok({
    now: Date.now(),
    reports: opsReports(),
    centers: db.centers.filter((c) => c.active).map(toPublicCenter),
  })
}
