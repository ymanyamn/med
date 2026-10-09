import { checkRate } from '@/lib/store'
import { ADMIN_EMAIL, ADMIN_PANEL_TOKEN, setSession, safeEqual } from '@/lib/session'
import { clientIp, fail, ok, readBody, str } from '@/lib/http'

// The admin panel uses the private panel access code instead of email delivery.
export async function POST(req: Request) {
  const b = await readBody(req)
  const ip = clientIp(req)
  if (!checkRate(`admin-login:${ip}`, 10, 15 * 60_000)) return fail('محاولات كثيرة، حاول لاحقاً', 429)

  const code = str(b.code, 120)
  if (!safeEqual(code, ADMIN_PANEL_TOKEN)) return fail('رمز لوحة التحكم غير صحيح', 401)

  await setSession({ role: 'admin', email: ADMIN_EMAIL }, 8)
  return ok({ message: 'تم تسجيل الدخول بنجاح' })
}
