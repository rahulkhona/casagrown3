/**
 * Campaign Zone Coverage Tests
 *
 * Tests that the H3 zone generation logic correctly computes all
 * resolution-7 H3 cells for a given geographic region.
 *
 * h3-js v4 uses GeoJSON coordinate order: [lng, lat]
 * polygonToCells(polygon, resolution, containmentMode)
 *   - polygon: [[lng, lat], ...] coordinates (outer ring)
 *   - 7: H3 resolution (≈5.16 km² hexes)
 *   - true: include cells partially within the polygon
 */

import { polygonToCells, cellToLatLng, latLngToCell } from 'h3-js'

// Helper: convert GeoJSON coordinates to h3-js format
// GeoJSON: [lng, lat] — h3-js v4 also uses [lng, lat]
function computeZonesForGeoJSON(geojson: { type: string; coordinates: any }): string[] {
  const allCells = new Set<string>()

  if (geojson.type === 'Polygon') {
    const cells = polygonToCells(geojson.coordinates, 7, true)
    cells.forEach(c => allCells.add(c))
  } else if (geojson.type === 'MultiPolygon') {
    for (const poly of geojson.coordinates) {
      const cells = polygonToCells(poly, 7, true)
      cells.forEach(c => allCells.add(c))
    }
  }

  return Array.from(allCells)
}

describe('Campaign Zone Coverage', () => {

  // ────────── BASIC H3 RESOLUTION 7 ──────────
  test('latLngToCell returns a resolution-7 cell for a known location', () => {
    // San Jose, CA — latLngToCell uses [lat, lng] order
    const cell = latLngToCell(37.2522, -121.8939, 7)
    expect(cell).toBeTruthy()
    expect(cell.length).toBeGreaterThan(0)
    // Resolution-7 cells start with '87'
    expect(cell).toMatch(/^87/)
  })

  // ────────── SIMPLE POLYGON ──────────
  test('polygonToCells returns cells for a small square', () => {
    // 10km x 10km near San Jose — [lng, lat] order for h3-js v4
    const polygon: [number, number][] = [
      [-121.95, 37.30],
      [-121.85, 37.30],
      [-121.85, 37.20],
      [-121.95, 37.20],
      [-121.95, 37.30], // close the ring
    ]

    const cells = polygonToCells(polygon, 7, true)
    
    expect(cells.length).toBeGreaterThan(5)
    expect(cells.length).toBeLessThan(200)
    
    cells.forEach(cell => {
      expect(cell).toMatch(/^87/)
    })
  })

  // ────────── ALL CELLS OVERLAP THE POLYGON ──────────
  test('all returned cells overlap with the input polygon', () => {
    const polygon: [number, number][] = [
      [-122.00, 37.35],
      [-121.85, 37.35],
      [-121.85, 37.25],
      [-122.00, 37.25],
      [-122.00, 37.35],
    ]

    const cells = polygonToCells(polygon, 7, true)
    expect(cells.length).toBeGreaterThan(0)

    cells.forEach(cell => {
      const [lat, lng] = cellToLatLng(cell) // returns [lat, lng]
      // Cell center should be within reasonable margin of the polygon
      expect(lat).toBeGreaterThan(37.25 - 0.1)
      expect(lat).toBeLessThan(37.35 + 0.1)
      expect(lng).toBeGreaterThan(-122.00 - 0.1)
      expect(lng).toBeLessThan(-121.85 + 0.1)
    })
  })

  // ────────── PARTIAL CONTAINMENT ──────────
  test('partial containment flag includes more cells than full containment', () => {
    const polygon: [number, number][] = [
      [-121.93, 37.30],
      [-121.90, 37.30],
      [-121.90, 37.28],
      [-121.93, 37.28],
      [-121.93, 37.30],
    ]

    const withPartial = polygonToCells(polygon, 7, true)
    const withoutPartial = polygonToCells(polygon, 7, false)

    expect(withPartial.length).toBeGreaterThanOrEqual(withoutPartial.length)
    withoutPartial.forEach(cell => {
      expect(withPartial).toContain(cell)
    })
  })

  // ────────── NO GAPS IN COVERAGE ──────────
  test('every point inside the polygon maps to a covered cell', () => {
    const polygon: [number, number][] = [
      [-121.98, 37.35],
      [-121.88, 37.35],
      [-121.88, 37.25],
      [-121.98, 37.25],
      [-121.98, 37.35],
    ]

    const cells = new Set(polygonToCells(polygon, 7, true))
    expect(cells.size).toBeGreaterThan(0)

    // 20 interior points — each should map to a covered cell
    const interiorPoints: [number, number][] = [
      [37.30, -121.93], [37.27, -121.95], [37.33, -121.90],
      [37.26, -121.89], [37.34, -121.96], [37.29, -121.92],
      [37.31, -121.94], [37.28, -121.91], [37.32, -121.97],
      [37.30, -121.90], [37.27, -121.93], [37.33, -121.95],
      [37.26, -121.92], [37.34, -121.89], [37.29, -121.96],
      [37.31, -121.91], [37.28, -121.94], [37.32, -121.90],
      [37.30, -121.97], [37.27, -121.89],
    ]

    interiorPoints.forEach(([lat, lng]) => {
      const cell = latLngToCell(lat, lng, 7) // latLngToCell uses [lat, lng]
      expect(cells.has(cell)).toBe(true)
    })
  })

  // ────────── GEOJSON POLYGON (Nominatim format) ──────────
  test('computeZonesForGeoJSON handles a GeoJSON Polygon', () => {
    // GeoJSON coordinates are already [lng, lat]
    const geojson = {
      type: 'Polygon',
      coordinates: [[
        [-121.95, 37.30],
        [-121.85, 37.30],
        [-121.85, 37.20],
        [-121.95, 37.20],
        [-121.95, 37.30],
      ]],
    }

    const zones = computeZonesForGeoJSON(geojson)
    expect(zones.length).toBeGreaterThan(5)
    zones.forEach(cell => expect(cell).toMatch(/^87/))
  })

  // ────────── MULTIPOLYGON ──────────
  test('computeZonesForGeoJSON handles MultiPolygon', () => {
    const geojson = {
      type: 'MultiPolygon',
      coordinates: [
        // San Jose area
        [[
          [-121.95, 37.30],
          [-121.90, 37.30],
          [-121.90, 37.25],
          [-121.95, 37.25],
          [-121.95, 37.30],
        ]],
        // San Francisco area
        [[
          [-122.45, 37.80],
          [-122.40, 37.80],
          [-122.40, 37.75],
          [-122.45, 37.75],
          [-122.45, 37.80],
        ]],
      ],
    }

    const zones = computeZonesForGeoJSON(geojson)
    expect(zones.length).toBeGreaterThan(5)

    // Cells from both regions
    const sjCells = zones.filter(cell => {
      const [lat, lng] = cellToLatLng(cell)
      return lat > 37.2 && lat < 37.35 && lng > -122.0 && lng < -121.85
    })
    const sfCells = zones.filter(cell => {
      const [lat, lng] = cellToLatLng(cell)
      return lat > 37.7 && lat < 37.85 && lng > -122.5 && lng < -122.35
    })

    expect(sjCells.length).toBeGreaterThan(0)
    expect(sfCells.length).toBeGreaterThan(0)
  })

  // ────────── ADDITIVE MERGING ──────────
  test('repeated searches merge zones additively (no duplicates)', () => {
    const polygon1: [number, number][] = [
      [-121.95, 37.30], [-121.90, 37.30],
      [-121.90, 37.25], [-121.95, 37.25], [-121.95, 37.30],
    ]
    const polygon2: [number, number][] = [
      [-122.10, 37.40], [-122.05, 37.40],
      [-122.05, 37.35], [-122.10, 37.35], [-122.10, 37.40],
    ]

    const cells1 = polygonToCells(polygon1, 7, true)
    const cells2 = polygonToCells(polygon2, 7, true)
    const merged = new Set([...cells1, ...cells2])
    
    expect(merged.size).toBeGreaterThanOrEqual(cells1.length)
    expect(merged.size).toBeGreaterThanOrEqual(cells2.length)
  })

  // ────────── DETERMINISTIC ──────────
  test('zone computation is deterministic for the same polygon', () => {
    const polygon: [number, number][] = [
      [-121.95, 37.30], [-121.85, 37.30],
      [-121.85, 37.20], [-121.95, 37.20], [-121.95, 37.30],
    ]

    const run1 = polygonToCells(polygon, 7, true).sort()
    const run2 = polygonToCells(polygon, 7, true).sort()
    expect(run1).toEqual(run2)
  })

  // ────────── ZONE COUNT SANITY CHECK ──────────
  test('a ZIP-code-sized area generates reasonable zone count', () => {
    // ZIP 95120 is roughly 15 km² — should produce ~3-10 res-7 cells
    const polygon: [number, number][] = [
      [-121.87, 37.24],
      [-121.83, 37.24],
      [-121.83, 37.20],
      [-121.87, 37.20],
      [-121.87, 37.24],
    ]

    const cells = polygonToCells(polygon, 7, true)
    expect(cells.length).toBeGreaterThanOrEqual(2)
    expect(cells.length).toBeLessThan(50)
  })
})
