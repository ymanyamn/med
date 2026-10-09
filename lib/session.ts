import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

export type Session =
  | { role: 'admin'; email: string; exp: number }
  | { role: 'ops'; exp: number }
  | { role: 'center'; centerId: string; exp: number }

const COOKIE = 'med_session'
const g = globalThis as unknown as { __medSecret?: string }
const SECRET = process.env.SESSION_SECRET ?? (g.__medSecret ??= randomBytes(32).toString('hex'))

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'redmimhmdov@gmail.com').toLowerCase()
export const ADMIN_PANEL_TOKEN = process.env.ADMIN_PANEL_TOKEN ?? 'k7Qz-M9xR-2pLw-Vt4e-Nc8H'

const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('base64url')

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

type SessionInput =
  | { role: 'admin'; email: string }
  | { role: 'ops' }
  | { role: 'center'; centerId: string }

export async function setSession(input: SessionInput, hours = 12) {
  const session = { ...input, exp: Date.now() + hours * 3600_000 }
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  const jar = await cookies()
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: hours * 3600,
  })
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value
  if (!raw) return null
  const [payload, sig] = raw.split('.')
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session
    return s.exp > Date.now() ? s : null
  } catch {
    return null
  }
}

export async function clearSession() {
  ;(await cookies()).delete(COOKIE)
}
