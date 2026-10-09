import { num, str } from './http'

type CenterInput = { name: string; city: string; lat: number; lng: number; phone: string; pin: string; active: boolean }
type Parsed = { error: string; data?: never } | { error?: never; data: CenterInput }

export function parseCenter(b: Record<string, unknown>): Parsed {
  const name = str(b.name, 80)
  const city = str(b.city, 60)
  const lat = num(b.lat, 29, 40)
  const lng = num(b.lng, 32, 45)
  const pin = str(b.pin, 8)
  if (name.length < 3) return { error: 'اسم المركز مطلوب' }
  if (lat === null || lng === null) return { error: 'يرجى تحديد موقع المركز على الخريطة داخل سوريا' }
  if (pin && !/^\d{4,8}$/.test(pin)) return { error: 'رمز الدخول يجب أن يكون من 4 إلى 8 أرقام' }
  return { data: { name, city, lat, lng, phone: str(b.phone, 20), pin, active: b.active !== false } }
}
