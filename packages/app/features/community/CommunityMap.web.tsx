'use client'

/**
 * CommunityMap — Web implementation using Leaflet directly (imperative).
 * Uses a ref-based approach to avoid react-leaflet's MapContainer SSR issues.
 */
import { useMemo, useRef, useEffect } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { buildHexRegions, computeViewport } from './h3-utils'
import type { CommunityMapProps } from './CommunityMapTypes'
import { colors } from '../../design-tokens'

// Fix Leaflet default marker icon in bundled environments
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

export default function CommunityMap({
  resolveData,
  height = 280,
  showLabels = true,
  selectedNeighborH3Indices = [],
}: CommunityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.Layer[]>([])

  const { regions, viewport } = useMemo(() => {
    const regions = buildHexRegions(resolveData.primary, resolveData.neighbors)
    const viewport = computeViewport(regions, resolveData.resolved_location)
    return { regions, viewport }
  }, [resolveData])

  // Initialize map once container is mounted
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [viewport.center.lat, viewport.center.lng],
      zoom: viewport.zoom,
      zoomControl: true,
      scrollWheelZoom: false,
      dragging: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update layers when regions or selectedNeighborH3Indices change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear old layers
    layersRef.current.forEach((layer) => map.removeLayer(layer))
    layersRef.current = []

    // Draw hex polygons
    regions.forEach((region) => {
      const isSelected = selectedNeighborH3Indices.includes(region.h3Index)
      const isFilled = region.isPrimary || isSelected

      const polygon = L.polygon(
        region.boundary.map(([lat, lng]) => [lat, lng] as L.LatLngTuple),
        {
          fillColor: isFilled ? colors.green[600] : colors.green[200],
          fillOpacity: isFilled ? 0.4 : 0.2,
          color: isFilled ? colors.green[700] : colors.green[500],
          weight: isFilled ? 3 : 2,
          dashArray: isFilled ? undefined : '6 4',
        }
      ).addTo(map)

      if (showLabels) {
        polygon.bindTooltip(region.name, {
          direction: 'center',
          permanent: true,
          className: 'hex-label',
        })
      }

      layersRef.current.push(polygon)
    })

    // User location marker
    if (resolveData.resolved_location) {
      const marker = L.marker(
        [resolveData.resolved_location.lat, resolveData.resolved_location.lng],
        { icon: defaultIcon }
      ).addTo(map)
      layersRef.current.push(marker)
    }
  }, [regions, selectedNeighborH3Indices, showLabels, resolveData.resolved_location])

  return (
    <>
      <div
        ref={containerRef}
        style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }}
      />
      <style>{`
        .hex-label {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          font-size: 10px;
          font-weight: 500;
          color: ${colors.green[700]};
          text-shadow: 0 0 3px white, 0 0 3px white;
          white-space: nowrap;
        }
        .hex-label::before {
          display: none !important;
        }
      `}</style>
    </>
  )
}
