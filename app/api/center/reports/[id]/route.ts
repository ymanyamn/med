import { centerAct, type CenterAction } from '@/lib/store'
import { fail, ok, readBody, requireRole, str } from '@/lib/http'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('center')
  if (!s) return fail('غير مصرح', 401)
  const { id } = await params
  const b = await readBody(req)
  const action = str(b.action, 10)

  let input: CenterAction
  if (action === 'receive' || action === 'complete') input = { action }
  else if (action === 'report') {
    const text = str(b.text, 4000)
    if (text.length < 10) return fail('يرجى كتابة تقرير مفصل (10 أحرف على الأقل)')
    input = { action, text }
  } else return fail('إجراء غير معروف')

  const error = centerAct(s.centerId, id, input)
  return error ? fail(error, 409) : ok()
}
