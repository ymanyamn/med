import { db, persistCenter, removeCenter } from '@/lib/store'
import { fail, ok, readBody, requireRole } from '@/lib/http'
import { parseCenter } from '@/lib/center-input'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await requireRole('admin'))) return fail('غير مصرح', 401)
  const { id } = await params
  const center = db.centers.find((c) => c.id === id)
  if (!center) return fail('المركز غير موجود', 404)
  const body = await readBody(req)

  if (Object.keys(body).length === 1 && typeof body.active === 'boolean') {
    center.active = body.active
    await persistCenter(center)
    return ok({ center })
  }
  const parsed = parseCenter(body)
  if (parsed.error !== undefined) return fail(parsed.error)
  Object.assign(center, { ...parsed.data, pin: parsed.data.pin || center.pin })
  await persistCenter(center)
  return ok({ center })
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await requireRole('admin'))) return fail('غير مصرح', 401)
  const { id } = await params
  const busy = db.reports.some((r) => r.centerId === id && (r.status === 'sent' || r.status === 'received'))
  if (busy) return fail('لا يمكن حذف مركز لديه مهام قيد التنفيذ', 409)
  db.centers = db.centers.filter((c) => c.id !== id)
  await removeCenter(id)
  return ok()
}
