import { randomBytes, randomInt } from 'crypto'
import { query } from './db'
import {
  SMART_TIMEOUT_MS,
  type Center,
  type CitizenReportView,
  type EmergencyType,
  type GeoPoint,
  type PublicCenter,
  type Report,
  type ReportView,
} from './types'

interface Otp {
  code: string
  expiresAt: number
  attempts: number
}

interface Database {
  centers: Center[]
  reports: Report[]
  settings: { opsPin: string }
  otp: Otp | null
  rate: Map<string, number[]>
}

const SEED_CENTERS: [string, string, number, number][] = [
  ['مركز دمشق - المزة', 'دمشق', 33.5003, 36.249],
  ['مركز دمشق - باب توما', 'دمشق', 33.5136, 36.3166],
  ['مركز ريف دمشق - دوما', 'ريف دمشق', 33.5722, 36.4024],
  ['مركز حلب - الشهباء', 'حلب', 36.2137, 37.13],
  ['مركز حلب - الصاخور', 'حلب', 36.215, 37.183],
  ['مركز إدلب المدينة', 'إدلب', 35.9306, 36.6339],
  ['مركز حمص - الوعر', 'حمص', 34.74, 36.68],
  ['مركز حماة', 'حماة', 35.1318, 36.7578],
  ['مركز اللاذقية', 'اللاذقية', 35.5317, 35.79],
  ['مركز طرطوس', 'طرطوس', 34.889, 35.8866],
  ['مركز درعا', 'درعا', 32.6189, 36.1021],
  ['مركز دير الزور', 'دير الزور', 35.3359, 40.1408],
  ['مركز الرقة', 'الرقة', 35.95, 39.01],
]

const pin = () => String(randomInt(1000, 10000))
const shortId = (prefix: string) =>
  `${prefix}-${randomBytes(4).toString('hex').toUpperCase().slice(0, 6)}`

function seed(): Database {
  return {
    centers: SEED_CENTERS.map(([name, city, lat, lng], i) => ({
      id: `C${String(i + 1).padStart(3, '0')}`,
      name,
      city,
      phone: '',
      lat,
      lng,
      pin: pin(),
      active: true,
      createdAt: Date.now(),
    })),
    reports: [],
    settings: { opsPin: pin() },
    otp: null,
    rate: new Map(),
  }
}

const globalStore = globalThis as unknown as { __medDb?: Database }
export const db: Database = (globalStore.__medDb ??= seed())

const databaseReady = (async () => {
  try {
    const [centers, reports, settings] = await Promise.all([
      query('SELECT id, name, city, phone, lat, lng, pin, active, extract(epoch from created_at) * 1000 AS "createdAt" FROM public.med_centers ORDER BY created_at ASC'),
      query('SELECT id, tracking_token AS "trackingToken", type, name, phone, description, address, location, status, extract(epoch from created_at) * 1000 AS "createdAt", extract(epoch from confirmed_at) * 1000 AS "confirmedAt", extract(epoch from sent_at) * 1000 AS "sentAt", extract(epoch from received_at) * 1000 AS "receivedAt", extract(epoch from completed_at) * 1000 AS "completedAt", center_id AS "centerId", assigned_by AS "assignedBy", incident_report AS "incidentReport", extract(epoch from report_submitted_at) * 1000 AS "reportSubmittedAt" FROM public.med_reports ORDER BY created_at DESC'),
      query('SELECT ops_pin FROM public.med_settings WHERE id = 1'),
    ])
    if (centers.rows.length) db.centers = centers.rows as Center[]
    if (reports.rows.length) db.reports = reports.rows as Report[]
    if (settings.rows[0]?.ops_pin) db.settings.opsPin = settings.rows[0].ops_pin
    if (!centers.rows.length) {
      await Promise.all(
        db.centers.map((center) =>
          query(
            `INSERT INTO public.med_centers (id,name,city,phone,lat,lng,pin,active,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9/1000.0))
             ON CONFLICT (id) DO NOTHING`,
            [center.id, center.name, center.city, center.phone, center.lat, center.lng, center.pin, center.active, center.createdAt],
          ),
        ),
      )
      await query(
        'INSERT INTO public.med_settings (id, ops_pin) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
        [db.settings.opsPin],
      )
    }
  } catch (error) {
    console.error('[v0] Neon hydration failed:', error)
  }
})()

async function persistReport(report: Report) {
  await databaseReady
  await query(`INSERT INTO public.med_reports (id, tracking_token, type, name, phone, description, address, location, status, created_at, confirmed_at, sent_at, received_at, completed_at, center_id, assigned_by, incident_report, report_submitted_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10/1000.0),to_timestamp($11/1000.0),to_timestamp($12/1000.0),to_timestamp($13/1000.0),to_timestamp($14/1000.0),$15,$16,$17,to_timestamp($18/1000.0))
    ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, location=EXCLUDED.location, confirmed_at=EXCLUDED.confirmed_at, sent_at=EXCLUDED.sent_at, received_at=EXCLUDED.received_at, completed_at=EXCLUDED.completed_at, center_id=EXCLUDED.center_id, assigned_by=EXCLUDED.assigned_by, incident_report=EXCLUDED.incident_report, report_submitted_at=EXCLUDED.report_submitted_at`, [report.id, report.trackingToken, report.type, report.name, report.phone, report.description, report.address, report.location ? JSON.stringify(report.location) : null, report.status, report.createdAt, report.confirmedAt ?? null, report.sentAt ?? null, report.receivedAt ?? null, report.completedAt ?? null, report.centerId ?? null, report.assignedBy ?? null, report.incidentReport ?? null, report.reportSubmittedAt ?? null])
}

export async function persistCenter(center: Center) {
  await databaseReady
  await query(`INSERT INTO public.med_centers (id,name,city,phone,lat,lng,pin,active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9/1000.0)) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, city=EXCLUDED.city, phone=EXCLUDED.phone, lat=EXCLUDED.lat, lng=EXCLUDED.lng, pin=EXCLUDED.pin, active=EXCLUDED.active`, [center.id, center.name, center.city, center.phone, center.lat, center.lng, center.pin, center.active, center.createdAt])
}

export async function removeCenter(id: string) {
  await databaseReady
  await query('DELETE FROM public.med_centers WHERE id = $1', [id])
}

export async function persistSettings() {
  await databaseReady
  await query('INSERT INTO public.med_settings (id, ops_pin) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET ops_pin=EXCLUDED.ops_pin, updated_at=now()', [db.settings.opsPin])
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const toPublicCenter = ({ pin: _pin, ...rest }: Center): PublicCenter => rest

export function nearestCenters(point: { lat: number; lng: number }, limit = 5) {
  return db.centers
    .filter((c) => c.active)
    .map((c) => ({ center: toPublicCenter(c), distanceKm: haversineKm(point, c) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
}

export function getCenter(id: string) {
  return db.centers.find((c) => c.id === id)
}

function smartAssign(report: Report) {
  if (!report.location) return false
  const [best] = nearestCenters(report.location, 1)
  if (!best) return false
  const now = Date.now()
  report.confirmedAt ??= now
  report.centerId = best.center.id
  report.sentAt = now
  report.status = 'sent'
  report.assignedBy = 'smart'
  void persistReport(report)
  return true
}

function applySmartTimeouts() {
  const now = Date.now()
  for (const r of db.reports) {
    if (r.status === 'pending' && now - r.createdAt >= SMART_TIMEOUT_MS) smartAssign(r)
  }
}

function toView(r: Report, withNearest: boolean): ReportView {
  const { trackingToken: _t, ...rest } = r
  return {
    ...rest,
    centerName: r.centerId ? getCenter(r.centerId)?.name : undefined,
    nearest: withNearest && r.location ? nearestCenters(r.location) : undefined,
  }
}

export function checkRate(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const hits = (db.rate.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= max) return false
  hits.push(now)
  db.rate.set(key, hits)
  return true
}

export function createReport(input: {
  type: EmergencyType
  name: string
  phone: string
  description: string
  address: string
  location: GeoPoint | null
}) {
  const report: Report = {
    ...input,
    id: shortId('MED'),
    trackingToken: randomBytes(16).toString('hex'),
    status: 'pending',
    createdAt: Date.now(),
  }
  db.reports.unshift(report)
  void persistReport(report)
  return report
}

export function findReportForCitizen(id: string, token: string) {
  const r = db.reports.find((x) => x.id === id)
  if (!r || r.trackingToken !== token) return null
  return r
}

export function citizenView(r: Report): CitizenReportView {
  applySmartTimeouts()
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    createdAt: r.createdAt,
    sentAt: r.sentAt,
    receivedAt: r.receivedAt,
    completedAt: r.completedAt,
    centerName: r.centerId ? getCenter(r.centerId)?.name : undefined,
  }
}

export function opsReports() {
  applySmartTimeouts()
  return db.reports.map((r) => toView(r, r.status === 'pending' || r.status === 'confirmed'))
}

export function centerReports(centerId: string) {
  applySmartTimeouts()
  return db.reports.filter((r) => r.centerId === centerId).map((r) => toView(r, false))
}

export type OpsAction = { action: 'confirm' } | { action: 'smart' } | { action: 'assign'; centerId: string }

export function opsAct(id: string, a: OpsAction): string | null {
  const r = db.reports.find((x) => x.id === id)
  if (!r) return 'البلاغ غير موجود'
  if (a.action === 'confirm') {
    if (r.status !== 'pending') return 'تمت معالجة البلاغ مسبقاً'
    r.status = 'confirmed'
    r.confirmedAt = Date.now()
    return null
  }
  if (a.action === 'smart') {
    if (r.status !== 'pending' && r.status !== 'confirmed') return 'تمت معالجة البلاغ مسبقاً'
    return smartAssign(r) ? null : 'لا يتوفر موقع للمبلغ أو مراكز فعالة'
  }
  if (r.status !== 'pending' && r.status !== 'confirmed') return 'تم إرسال البلاغ مسبقاً'
  const center = getCenter(a.centerId)
  if (!center || !center.active) return 'المركز غير متاح'
  const now = Date.now()
  r.confirmedAt ??= now
  r.centerId = center.id
  r.sentAt = now
  r.status = 'sent'
  r.assignedBy = 'operator'
  void persistReport(r)
  return null
}

export type CenterAction = { action: 'receive' } | { action: 'complete' } | { action: 'report'; text: string }

export function centerAct(centerId: string, id: string, a: CenterAction): string | null {
  const r = db.reports.find((x) => x.id === id && x.centerId === centerId)
  if (!r) return 'البلاغ غير موجود'
  if (a.action === 'receive') {
    if (r.status !== 'sent') return 'الحالة لا تسمح بالاستلام'
    r.status = 'received'
    r.receivedAt = Date.now()
    void persistReport(r)
    return null
  }
  if (a.action === 'complete') {
    if (r.status !== 'received') return 'يجب استلام المهمة أولاً'
    r.status = 'completed'
    r.completedAt = Date.now()
    void persistReport(r)
    return null
  }
  if (r.status !== 'completed') return 'يجب إنهاء المهمة أولاً'
  if (r.incidentReport) return 'تم إرسال التقرير مسبقاً'
  r.incidentReport = a.text
  r.reportSubmittedAt = Date.now()
  void persistReport(r)
  return null
}

export function newCenterId() {
  return shortId('C')
}

export { pin as generatePin }
