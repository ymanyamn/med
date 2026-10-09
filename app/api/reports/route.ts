import { checkRate, createReport } from '@/lib/store'
import { EMERGENCY_TYPES, type EmergencyType, type GeoPoint } from '@/lib/types'
import { clientIp, fail, num, ok, readBody, str } from '@/lib/http'

const TYPES = new Set<string>(EMERGENCY_TYPES.map((t) => t.key))

export async function POST(req: Request) {
  if (!checkRate(`report:${clientIp(req)}`, 6, 10 * 60_000)) {
    return fail('تم إرسال عدة بلاغات مؤخراً، يرجى الانتظار قليلاً أو الاتصال المباشر', 429)
  }
  const b = await readBody(req)
  const type = str(b.type, 20)
  const phone = str(b.phone, 20)
  const address = str(b.address, 300)

  if (!TYPES.has(type)) return fail('يرجى اختيار نوع الحالة')
  if (!/^[0-9+\-\s]{7,20}$/.test(phone)) return fail('يرجى إدخال رقم هاتف صحيح')

  let location: GeoPoint | null = null
  const loc = b.location as Record<string, unknown> | undefined
  if (loc) {
    const lat = num(loc.lat, -90, 90)
    const lng = num(loc.lng, -180, 180)
    if (lat !== null && lng !== null) {
      location = { lat, lng, accuracy: num(loc.accuracy, 0, 100000) ?? undefined, updatedAt: Date.now() }
    }
  }
  if (!location && address.length < 3) return fail('تعذر تحديد موقعك، يرجى كتابة العنوان')

  const report = createReport({
    type: type as EmergencyType,
    name: str(b.name, 80),
    phone,
    description: str(b.description, 1000),
    address,
    location,
  })
  return ok({ id: report.id, token: report.trackingToken })
}
