import { NextResponse } from 'next/server'
import { getSession, type Session } from './session'

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })
export const ok = <T extends object>(data: T = { ok: true } as T) => NextResponse.json(data)

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function num(v: unknown, min: number, max: number) {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

export function clientIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
}

export async function requireRole<R extends Session['role']>(role: R) {
  const s = await getSession()
  return s && s.role === role ? (s as Extract<Session, { role: R }>) : null
}
