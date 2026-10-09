import {
  Bomb,
  Building2,
  CarFront,
  CircleAlert,
  CloudRain,
  Flame,
  HeartPulse,
  LifeBuoy,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import type { EmergencyType } from '@/lib/types'

const ICONS: Record<EmergencyType, LucideIcon> = {
  fire: Flame,
  collapse: Building2,
  accident: CarFront,
  medical: HeartPulse,
  drowning: Waves,
  flood: CloudRain,
  rescue: LifeBuoy,
  explosive: Bomb,
  other: CircleAlert,
}

export function EmergencyIcon({ type, className }: { type: EmergencyType; className?: string }) {
  const Icon = ICONS[type] ?? CircleAlert
  return <Icon className={className} aria-hidden="true" />
}
