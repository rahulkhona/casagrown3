'use client'

import React, { useEffect, useRef, useState, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { YStack, XStack, Text, Button, Input, Spinner } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Search, MapPin } from '@tamagui/lucide-icons'
// Use h3-js directly since next-admin is web-only and supports WASM 
// (unlike Hermes on React Native)
import { latLngToCell, cellToBoundary, getRes0Cells, getIcosahedronFaces, gridDisk, polygonToCells } from 'h3-js'

export interface AdminMapWidgetProps {
  selectedH3Indices: string[]
  onChange: (indices: string[]) => void
  height?: number | string
  defaultCenter?: { lat: number, lng: number }
  readOnly?: boolean
  /** When true, searching auto-fills all H3 cells inside the search polygon. No manual clicking needed. */
  autoFillOnSearch?: boolean
}

// Fix Leaflet paths for Next.js
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

export function AdminMapWidget({
  selectedH3Indices,
  onChange,
  height = 400,
  defaultCenter = { lat: 39.8283, lng: -98.5795 }, // Center of US
  readOnly = false,
  autoFillOnSearch = false
}: AdminMapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)
  
  // A secondary layer just for the faint "clickable" grid overlays
  const gridLayerRef = useRef<L.LayerGroup | null>(null)

  // A layer for masking out everything outside the searched area
  const maskLayerRef = useRef<L.LayerGroup | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [defaultCenter.lat, defaultCenter.lng],
      zoom: 4,
      zoomControl: true,
      scrollWheelZoom: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map)

    const layerGroup = L.layerGroup().addTo(map)
    const gridLayer = L.layerGroup().addTo(map)
    const maskLayer = L.layerGroup().addTo(map)
    layerGroupRef.current = layerGroup
    gridLayerRef.current = gridLayer
    maskLayerRef.current = maskLayer
    mapRef.current = map

    // Helper to draw faint interactive hexes for the current view
    const drawGrid = () => {
      if (!map || readOnly || !gridLayerRef.current) return
      gridLayerRef.current.clearLayers()
      
      let bounds, center
      try {
        bounds = map.getBounds()
        center = bounds.getCenter()
      } catch (_e) {
        // Map not fully initialized yet (container not laid out)
        return
      }
      
      // We limit rendering to zoom >= 7 to prevent drawing 10,000s of hexes on continent view
      if (map.getZoom() < 7) return
      
      try {
        // Distance in meters from center to edge of screen
        const northEast = bounds.getNorthEast()
        const distanceMeters = map.distance(center, northEast)
        
        // At resolution 7, an H3 hex is roughly 2km (2000m) wide. 
        // We dynamically calculate how many rings of hexes we need to fill the screen.
        // We cap it at 35 to prevent browser crash if user has a massive monitor or low zoom.
        const ringsNeeded = Math.min(Math.ceil(distanceMeters / 2000), 35)

        const centerCell = latLngToCell(center.lat, center.lng, 7)
        const cellDisk = gridDisk(centerCell, ringsNeeded) 
        
        cellDisk.forEach(h3Index => {
          // It's safe to always draw the faint version under the main one because
          // we don't have reactive access to selectedH3Indices here. 
          // The green selections in the other hook will just render directly on top.
          const boundary = cellToBoundary(h3Index) // defaults to [lat, lng] for Leaflet
          const polygon = L.polygon(boundary as [number, number][], {
            fillColor: colors.gray[400],
            fillOpacity: 0.2, // Boosted opacity
            color: colors.gray[600],
            weight: 2, 
            dashArray: '4, 4'
          })
          
          polygon.on('mouseover', () => {
            polygon.setStyle({ fillOpacity: 0.5, fillColor: colors.green[200], color: colors.green[500] })
          })

          polygon.on('mouseout', () => {
             polygon.setStyle({ fillOpacity: 0.2, fillColor: colors.gray[400], color: colors.gray[600] })
          })

          // When the faint polygon is clicked, fire a map click so the generic click handler kicks in
          polygon.on('click', (e) => {
            L.DomEvent.stopPropagation(e as any)
            map.fire('click', { latlng: polygon.getBounds().getCenter() })
          })
          
          polygon.addTo(gridLayerRef.current!)
        })
      } catch (e) {
        console.warn('Grid draw aborted:', e)
      }
    }

    // Handle map clicks to toggle H3 resolution 7 hexes (only in manual mode)
    if (!readOnly && !autoFillOnSearch) {
      map.on('click', (e) => {
        const { lat, lng } = e.latlng
        try {
          const h3Index = latLngToCell(lat, lng, 7)
          onChange(
            selectedH3Indices.includes(h3Index)
              ? selectedH3Indices.filter(id => id !== h3Index)
              : [...selectedH3Indices, h3Index]
          )
        } catch (err) {
          console.error('H3 error:', err)
        }
      })
      
      map.on('moveend', drawGrid)
      // Initial draw
      setTimeout(drawGrid, 500)
    } else if (!readOnly && autoFillOnSearch) {
      map.on('moveend', drawGrid)
      setTimeout(drawGrid, 500)
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
    // We purposefully only run this once to attach the map.
    // The visual updates react to selectedH3Indices changes below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update drawn hexes when selectedH3Indices change
  useEffect(() => {
    if (!layerGroupRef.current || !mapRef.current) return
    const layerGroup = layerGroupRef.current
    layerGroup.clearLayers()

    selectedH3Indices.forEach(h3Index => {
      try {
        const boundary = cellToBoundary(h3Index) // defaults to [lat, lng] for Leaflet
        const polygon = L.polygon(boundary as [number, number][], {
          fillColor: colors.green[600],
          fillOpacity: 0.5,
          color: colors.green[800],
          weight: 2
        })
        
        if (!readOnly) {
          polygon.on('click', () => {
            onChange(selectedH3Indices.filter(id => id !== h3Index))
          })
        }
        
        polygon.bindTooltip(`Zone: ${h3Index}`, { sticky: true })
        polygon.addTo(layerGroup)
      } catch (e) {
        console.warn('Invalid H3 Index', h3Index)
      }
    })
  }, [selectedH3Indices, onChange, readOnly])

  const handleSearch = async () => {
    if (!searchQuery.trim() || !mapRef.current) return
    setIsSearching(true)
    try {
      const query = searchQuery.trim()
      const isZip = /^\d{5}$/.test(query)
      
      // For zip codes, use structured search for precise polygon boundaries
      let searchUrl: string
      if (isZip) {
        searchUrl = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${query}&countrycodes=us&polygon_geojson=1&limit=1`
      } else {
        searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&polygon_geojson=1&limit=1`
      }
      
      const res = await fetch(searchUrl)
      const data = await res.json()
      
      if (data && data.length > 0) {
        const { lat, lon, geojson } = data[0]
        
        // 1. Clear any existing masks
        if (maskLayerRef.current) maskLayerRef.current.clearLayers()

        // 2. Draw a dark inverted mask if we have geometry
        if (geojson && maskLayerRef.current) {
          // Define the outer boundary of the entire world
          const outerRing = [
            [-90, -360],
            [90, -360],
            [90, 360],
            [-90, 360],
            [-90, -360]
          ]

          // For the inner hole, we need to convert GeoJSON [lng, lat] to Leaflet [lat, lng]
          let innerHoles: any[] = []
          
          if (geojson.type === 'Polygon') {
            innerHoles = geojson.coordinates.map((ring: any) => 
              ring.map((coord: number[]) => [coord[1], coord[0]])
            )
          } else if (geojson.type === 'MultiPolygon') {
            innerHoles = geojson.coordinates.flatMap((poly: any) => 
              poly.map((ring: any) => ring.map((coord: number[]) => [coord[1], coord[0]]))
            )
          }

          // Combine outer ring and inner holes to create an inverted polygon
          if (innerHoles.length > 0) {
            // Dark mask outside the region
            L.polygon([outerRing, ...innerHoles] as any, {
              color: 'none',
              fillColor: colors.gray[900],
              fillOpacity: 0.5,
              interactive: false
            }).addTo(maskLayerRef.current)

            // Auto-fill: compute all H3 cells inside the polygon
            if (autoFillOnSearch && geojson) {
              try {
                // h3-js v4 polygonToCells expects [lng, lat] (GeoJSON order) — pass coordinates as-is
                let polygonCoords: number[][][]
                if (geojson.type === 'Polygon') {
                  polygonCoords = geojson.coordinates
                } else if (geojson.type === 'MultiPolygon') {
                  // For MultiPolygon, compute cells for each polygon and merge
                  const allCells = new Set(selectedH3Indices)
                  for (const poly of geojson.coordinates) {
                    const cells = polygonToCells(poly, 7, true)
                    cells.forEach((c: string) => allCells.add(c))
                  }
                  onChange(Array.from(allCells))
                  polygonCoords = [] // skip single polygon fill below
                } else {
                  polygonCoords = []
                }

                if (polygonCoords.length > 0) {
                  const cells = polygonToCells(polygonCoords, 7, true)
                  // Merge with existing selections (additive)
                  const merged = new Set([...selectedH3Indices, ...cells])
                  onChange(Array.from(merged))
                }
              } catch (e) {
                console.warn('polygonToCells failed:', e)
              }
            }

            // Visible boundary outline of the searched region
            innerHoles.forEach((ring: [number, number][]) => {
              L.polyline(ring, {
                color: '#f97316',   // orange-500
                weight: 3,
                dashArray: '6, 4',
                opacity: 0.9,
                interactive: false
              }).addTo(maskLayerRef.current!)
            })

            // Trap the user's viewport inside this specific geometry
            const bounds = L.latLngBounds(innerHoles.flat() as [number, number][])
            // Pad the bounds slightly so the geometry isn't right on the edge of the screen
            mapRef.current.setMaxBounds(bounds.pad(0.02))
            // Fit the map exactly to these bounds instead of a hardcoded flyTo zoom
            mapRef.current.fitBounds(bounds, { padding: [20, 20] })
            
            // Set a minimum zoom so they can't wheel-zoom out to see the whole state again
            mapRef.current.setMinZoom(mapRef.current.getBoundsZoom(bounds))
          } else {
            // Fallback if no polygon geometry was returned
            mapRef.current.setMaxBounds(null as any) // Release bounds
            mapRef.current.setMinZoom(4)
            mapRef.current.flyTo([parseFloat(lat), parseFloat(lon)], 13)
          }
        } else {
           // Fallback if no geojson was requested or available
           mapRef.current.setMaxBounds(null as any)
           mapRef.current.setMinZoom(4)
           mapRef.current.flyTo([parseFloat(lat), parseFloat(lon)], 13)
        }
      }
    } catch (e) {
      console.error('Geocoding error', e)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    // @ts-expect-error React type version mismatch
    <YStack gap="$3" width="100%">
      
      {!readOnly && (
        // @ts-expect-error React type version mismatch
        <XStack gap="$2" alignItems="center">
          {/* @ts-expect-error React type version mismatch */}
          <Input 
            flex={1}
            placeholder="Search city, state, or zip to jump on map..." 
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            paddingLeft="$3"
            fontWeight="normal"
          />
          {/* @ts-expect-error React type version mismatch */}
          <Button 
            backgroundColor={colors.green[600]} 
            onPress={handleSearch}
            disabled={isSearching}
            icon={isSearching ? (Spinner as any)({ color: "white" }) : <Search color="white" size={18} />}
          >
            {/* @ts-expect-error React type version mismatch */}
            <Text color="white" fontWeight="600">Find</Text>
          </Button>
        </XStack>
      )}

      {!readOnly && (
        // @ts-expect-error React type version mismatch
        <XStack gap="$2" alignItems="center" paddingHorizontal="$2">
          <MapPin size={16} color={colors.gray[500]} />
          {/* @ts-expect-error React type version mismatch */}
          <Text fontSize="$3" color={colors.gray[600]}>
            Click anywhere on the map to select or deselect a zone (Resolution 7).
          </Text>
        </XStack>
      )}

      {/* @ts-expect-error React type version mismatch */}
      <YStack 
        borderRadius="$4" 
        overflow="hidden" 
        borderWidth={1} 
        borderColor={colors.gray[200]}
      >
        <div 
          ref={containerRef} 
          style={{ width: '100%', height: typeof height === 'number' ? `${height}px` : height, zIndex: 0 }} 
        />
      </YStack>

    </YStack>
  )
}
