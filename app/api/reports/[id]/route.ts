import { citizenView, findReportForCitizen } from '@/lib/store'
import { fail, ok } from '@/lib/http'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = new URL(req.url).searchParams.get('t') ?? ''
  const report = findReportForCitizen(id, token)
  if (!report) return fail('البلاغ غير موجود', 404)
  return ok(citizenView(report))
}
