import { randomInt } from 'crypto'
import { checkRate, db } from '@/lib/store'
import { ADMIN_EMAIL, safeEqual, setSession } from '@/lib/session'
import { sendLoginCode } from '@/lib/mail'
import { clientIp, fail, ok, readBody, str } from '@/lib/http'

export async function POST(req: Request) {
  const b = await readBody(req)
  const email = str(b.email, 120).toLowerCase()
  const ip = clientIp(req)

  if (b.step === 'request') {
    if (!checkRate(`otp-req:${ip}`, 5, 15 * 60_000)) return fail('محاولات كثيرة، حاول لاحقاً', 429)
    const generic = { ok: true, message: 'إذا كان البريد مخولاً فسيصلك رمز الدخول خلال لحظات' }
    if (!safeEqual(email, ADMIN_EMAIL)) return ok(generic)

    const code = String(randomInt(100000, 1000000))
    db.otp = { code, expiresAt: Date.now() + 10 * 60_000, attempts: 0 }
    const { sent } = await sendLoginCode(ADMIN_EMAIL, code)

    if (!sent && process.env.NODE_ENV !== 'production') {
      return ok({ ...generic, devCode: code })
    }
    if (!sent) return fail('تعذر إرسال البريد، تحقق من إعداد خدمة البريد', 503)
    return ok(generic)
  }

  if (b.step === 'verify') {
    if (!checkRate(`otp-verify:${ip}`, 10, 15 * 60_000)) return fail('محاولات كثيرة، حاول لاحقاً', 429)
    const otp = db.otp
    const code = str(b.code, 6)
    if (!otp || otp.expiresAt < Date.now() || !safeEqual(email, ADMIN_EMAIL)) {
      return fail('الرمز منتهي الصلاحية، اطلب رمزاً جديداً', 401)
    }
    otp.attempts += 1
    if (otp.attempts > 5) {
      db.otp = null
      return fail('تم تجاوز عدد المحاولات، اطلب رمزاً جديداً', 401)
    }
    if (!safeEqual(code, otp.code)) return fail('الرمز غير صحيح', 401)
    db.otp = null
    await setSession({ role: 'admin', email: ADMIN_EMAIL }, 8)
    return ok()
  }

  return fail('طلب غير صالح')
}
