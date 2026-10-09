import { checkRate, db, getCenter } from '@/lib/store'
import { clearSession, safeEqual, setSession } from '@/lib/session'
import { clientIp, fail, ok, readBody, str } from '@/lib/http'

export async function POST(req: Request) {
  if (!checkRate(`staff:${clientIp(req)}`, 8, 5 * 60_000)) {
    return fail('محاولات كثيرة، يرجى المحاولة بعد 5 دقائق', 429)
  }
  const b = await readBody(req)
  const role = str(b.role, 10)
  const pin = str(b.pin, 10)

  if (role === 'ops') {
    if (!safeEqual(pin, db.settings.opsPin)) return fail('رمز الدخول غير صحيح', 401)
    await setSession({ role: 'ops' })
    return ok({ redirect: '/ops' })
  }
  if (role === 'center') {
    const center = getCenter(str(b.centerId, 20))
    if (!center || !center.active) return fail('المركز غير متاح', 404)
    if (!safeEqual(pin, center.pin)) return fail('رمز الدخول غير صحيح', 401)
    await setSession({ role: 'center', centerId: center.id })
    return ok({ redirect: '/center' })
  }
  return fail('نوع الحساب غير معروف')
}

export async function DELETE() {
  await clearSession()
  return ok()
}
