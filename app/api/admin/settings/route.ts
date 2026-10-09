import { db } from '@/lib/store'
import { clearSession } from '@/lib/session'
import { fail, ok, readBody, requireRole, str } from '@/lib/http'

export async function PATCH(req: Request) {
  if (!(await requireRole('admin'))) return fail('غير مصرح', 401)
  const b = await readBody(req)
  const opsPin = str(b.opsPin, 8)
  if (!/^\d{4,8}$/.test(opsPin)) return fail('رمز غرفة العمليات يجب أن يكون من 4 إلى 8 أرقام')
  db.settings.opsPin = opsPin
  return ok()
}

export async function DELETE() {
  if (!(await requireRole('admin'))) return fail('غير مصرح', 401)
  await clearSession()
  return ok()
}
