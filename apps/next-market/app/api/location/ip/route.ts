import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(req: Request) {
  const headers = req.headers

  const latHeader = headers.get('x-vercel-ip-latitude')
  const lngHeader = headers.get('x-vercel-ip-longitude')
  const zip = headers.get('x-vercel-ip-postal-code') || ''
  const city = headers.get('x-vercel-ip-city') || ''
  const state = headers.get('x-vercel-ip-country-region') || ''

  if (latHeader && lngHeader) {
    const lat = parseFloat(latHeader)
    const lng = parseFloat(lngHeader)
    if (!isNaN(lat) && !isNaN(lng)) {
      return NextResponse.json({
        lat,
        lng,
        zip,
        city: decodeURIComponent(city),
        state,
        source: 'vercel-edge-header',
      })
    }
  }

  // Development / Localhost IP fallback using ip-api.com
  try {
    const res = await fetch('http://ip-api.com/json/?fields=status,lat,lon,zip,city,region', {
      signal: AbortSignal.timeout(2000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.status === 'success' && data.lat && data.lon) {
        return NextResponse.json({
          lat: data.lat,
          lng: data.lon,
          zip: data.zip || '',
          city: data.city || '',
          state: data.region || '',
          source: 'ip-api',
        })
      }
    }
  } catch {
    /* ignore fallback failure */
  }

  return NextResponse.json({
    lat: null,
    lng: null,
    zip: '',
    city: '',
    state: '',
    source: 'none',
  })
}
