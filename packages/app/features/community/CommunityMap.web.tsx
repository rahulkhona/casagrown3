'use client'

/**
 * CommunityMap — Web implementation using react-leaflet + OpenStreetMap tiles.
 * Renders H3 hexagonal zone boundaries with the primary zone in dark green
 * and neighbors in light green.
 */
import { useMemo } from 'react'
import { MapContainer, TileLayer, Polygon, Marker, Tooltip } from 'react-leaflet'
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
}: CommunityMapProps) {
  const { regions, viewport } = useMemo(() => {
    const regions = buildHexRegions(resolveData.primary, resolveData.neighbors)
    const viewport = computeViewport(
      regions,
      resolveData.resolved_location
    )
    return { regions, viewport }
  }, [resolveData])

  return (
    <div style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }}>
      <MapContainer
        center={[viewport.center.lat, viewport.center.lng]}
        zoom={viewport.zoom}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
        scrollWheelZoom={false}
        dragging={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Render hex polygons */}
        {regions.map((region) => (
          <Polygon
            key={region.h3Index}
            positions={region.boundary.map(([lat, lng]) => [lat, lng] as [number, number])}
            pathOptions={{
              fillColor: region.isPrimary ? colors.green[600] : colors.green[200],
              fillOpacity: region.isPrimary ? 0.4 : 0.2,
              color: region.isPrimary ? colors.green[700] : colors.green[500],
              weight: region.isPrimary ? 3 : 2,
              dashArray: region.isPrimary ? undefined : '6 4',
            }}
          >
            {showLabels && (
              <Tooltip
                direction="center"
                permanent
                className="hex-label"
              >
                <span style={{
                  fontSize: region.isPrimary ? 12 : 10,
                  fontWeight: region.isPrimary ? 700 : 500,
                  color: region.isPrimary ? colors.green[800] : colors.green[700],
                  textShadow: '0 0 3px white, 0 0 3px white',
                  whiteSpace: 'nowrap',
                }}>
                  {region.name}
                </span>
              </Tooltip>
            )}
          </Polygon>
        ))}

        {/* User location marker */}
        {resolveData.resolved_location && (
          <Marker
            position={[
              resolveData.resolved_location.lat,
              resolveData.resolved_location.lng,
            ]}
            icon={defaultIcon}
          />
        )}
      </MapContainer>

      {/* Override Leaflet tooltip styles */}
      <style>{`
        .hex-label {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .hex-label::before {
          display: none !important;
        }
      `}</style>
    </div>
  )
}
