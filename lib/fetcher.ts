export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'تعذر تحميل البيانات')
  return data as T
}

export async function sendJSON<T = { ok: true }>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'حدث خطأ غير متوقع')
  return data as T
}

export function formatTime(ts?: number) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(ts?: number) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('ar-SY', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
