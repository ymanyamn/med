import { db, opsReports } from '@/lib/store'
import { fail, ok, requireRole } from '@/lib/http'

export async function GET() {
  if (!(await requireRole('admin'))) return fail('غير مصرح', 401)
  const reports = opsReports()
  return ok({
    centers: db.centers,
    opsPin: db.settings.opsPin,
    reports: reports.slice(0, 50),
    stats: {
      total: reports.length,
      active: reports.filter((r) => r.status !== 'completed').length,
      completed: reports.filter((r) => r.status === 'completed').length,
      withReport: reports.filter((r) => r.incidentReport).length,
      missingReport: reports.filter((r) => r.status === 'completed' && !r.incidentReport).length,
      smart: reports.filter((r) => r.assignedBy === 'smart').length,
    },
  })
}
