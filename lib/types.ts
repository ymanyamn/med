export const EMERGENCY_TYPES = [
  { key: 'fire', label: 'حريق' },
  { key: 'collapse', label: 'انهيار مبنى' },
  { key: 'accident', label: 'حادث سير' },
  { key: 'medical', label: 'إسعاف طبي' },
  { key: 'drowning', label: 'غرق' },
  { key: 'flood', label: 'سيول وفيضانات' },
  { key: 'rescue', label: 'إنقاذ عالقين' },
  { key: 'explosive', label: 'مخلفات حرب' },
  { key: 'other', label: 'حالة أخرى' },
] as const

export type EmergencyType = (typeof EMERGENCY_TYPES)[number]['key']

export const EMERGENCY_LABEL: Record<EmergencyType, string> = Object.fromEntries(
  EMERGENCY_TYPES.map((t) => [t.key, t.label]),
) as Record<EmergencyType, string>

export type ReportStatus = 'pending' | 'confirmed' | 'sent' | 'received' | 'completed'

export const STATUS_LABEL: Record<ReportStatus, string> = {
  pending: 'بانتظار التأكيد',
  confirmed: 'مؤكد - اختيار مركز',
  sent: 'تم الإرسال',
  received: 'تم الاستلام',
  completed: 'تم الانتهاء',
}

export const SMART_TIMEOUT_MS = 30_000

export interface GeoPoint {
  lat: number
  lng: number
  accuracy?: number
  updatedAt: number
}

export interface Center {
  id: string
  name: string
  city: string
  phone: string
  lat: number
  lng: number
  pin: string
  active: boolean
  createdAt: number
}

export type PublicCenter = Omit<Center, 'pin'>

export interface Report {
  id: string
  trackingToken: string
  type: EmergencyType
  name: string
  phone: string
  description: string
  address: string
  location: GeoPoint | null
  status: ReportStatus
  createdAt: number
  confirmedAt?: number
  sentAt?: number
  receivedAt?: number
  completedAt?: number
  centerId?: string
  assignedBy?: 'operator' | 'smart'
  incidentReport?: string
  reportSubmittedAt?: number
}

export type ReportView = Omit<Report, 'trackingToken'> & {
  centerName?: string
  nearest?: { center: PublicCenter; distanceKm: number }[]
}

export interface CitizenReportView {
  id: string
  type: EmergencyType
  status: ReportStatus
  createdAt: number
  sentAt?: number
  receivedAt?: number
  completedAt?: number
  centerName?: string
}
