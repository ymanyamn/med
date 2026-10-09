'use client'

import dynamic from 'next/dynamic'

export type { MapPoint } from './live-map'

export const LiveMap = dynamic(() => import('./live-map'), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-muted text-sm text-muted-foreground">
      جارٍ تحميل الخريطة...
    </div>
  ),
})
