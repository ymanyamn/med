import { db, generatePin, newCenterId, persistCenter } from '@/lib/store'
import { parseCenter } from '@/lib/center-input'
import { fail, ok, readBody, requireRole } from '@/lib/http'
import type { Center } from '@/lib/types'

export async function POST(req: Request) {
  if (!(await requireRole('admin'))) return fail('غير مصرح', 401)
  const parsed = parseCenter(await readBody(req))
  if (parsed.error !== undefined) return fail(parsed.error)
  const center: Center = {
    ...parsed.data,
    pin: parsed.data.pin || generatePin(),
    id: newCenterId(),
    createdAt: Date.now(),
  }
  db.centers.push(center)
  await persistCenter(center)
  return ok({ center })
}
