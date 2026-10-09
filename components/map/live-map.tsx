'use client'

import 'leaflet/dist/leaflet.css'
import { Fragment, useEffect } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'

export interface MapPoint {
  id: string
  lat: number
  lng: number
  kind: 'citizen' | 'center' | 'selected'
  label?: string
}

export interface LiveMapProps {
  center: [number, number]
  zoom?: number
  points: MapPoint[]
  onPick?: (lat: number, lng: number) => void
  onPointClick?: (id: string) => void
  className?: string
  follow?: boolean
}

function Recenter({ center, follow }: { center: [number, number]; follow: boolean }) {
  const map = useMap()
  const [lat, lng] = center
  useEffect(() => {
    if (follow) map.setView([lat, lng], map.getZoom(), { animate: true })
  }, [lat, lng, follow, map])
  return null
}

function PickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

export default function LiveMap({
  center,
  zoom = 13,
  points,
  onPick,
  onPointClick,
  className,
  follow = true,
}: LiveMapProps) {
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom className={className} attributionControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter center={center} follow={follow} />
      {onPick && <PickHandler onPick={onPick} />}
      {points.map((p) =>
        p.kind === 'citizen' ? (
          <Fragment key={p.id}>
            <CircleMarker center={[p.lat, p.lng]} radius={14} pathOptions={{ className: 'marker-citizen-pulse', weight: 0 }} interactive={false} />
            <CircleMarker center={[p.lat, p.lng]} radius={8} pathOptions={{ className: 'marker-citizen', weight: 3, fillOpacity: 1 }}>
              {p.label && <Tooltip direction="top">{p.label}</Tooltip>}
            </CircleMarker>
          </Fragment>
        ) : (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={p.kind === 'selected' ? 10 : 7}
            pathOptions={{ className: p.kind === 'selected' ? 'marker-selected' : 'marker-center', weight: 2, fillOpacity: 1 }}
            eventHandlers={onPointClick ? { click: () => onPointClick(p.id) } : undefined}
          >
            {p.label && <Tooltip direction="top">{p.label}</Tooltip>}
          </CircleMarker>
        ),
      )}
    </MapContainer>
  )
}
