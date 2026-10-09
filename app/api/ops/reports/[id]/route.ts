import { opsAct, type OpsAction } from '@/lib/store'
import { fail, ok, readBody, requireRole, str } from '@/lib/http'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireRole('ops'))) return fail('غير مصرح', 401)
  const { id } = await params
  const b = await readBody(req)
  const action = str(b.action, 10)

  let input: OpsAction
  if (action === 'confirm' || action === 'smart') input = { action }
  else if (action === 'assign') input = { action, centerId: str(b.centerId, 20) }
  else return fail('إجراء غير معروف')

  const error = opsAct(id, input)
  return error ? fail(error, 409) : ok()
}
