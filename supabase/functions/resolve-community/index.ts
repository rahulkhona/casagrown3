import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { latLngToCell, cellToBoundary } from 'npm:h3-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { lat, lng } = await req.json()

    if (!lat || !lng) {
      throw new Error('Missing lat or lng')
    }

    // 1. Calculate H3 Index (Resolution 7)
    const h3Index = latLngToCell(lat, lng, 7)
    console.log(`Resolved H3 Index: ${h3Index} for location (${lat}, ${lng})`)

    // 2. Check if community exists
    const { data: existingCommunity, error: dbError } = await supabase
      .from('communities')
      .select('*')
      .eq('h3_index', h3Index)
      .single()

    if (existingCommunity && !dbError) {
      console.log('Community found in DB')
      return new Response(JSON.stringify(existingCommunity), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 3. If MISS -> Verify/Generate via Overpass API (Lazy Load)
    console.log('Community MISS. Generating via Overpass API...')

    // Get polygon boundary for the H3 cell
    const boundary = cellToBoundary(h3Index) // Array of [lat, lng]
    
    // Calculate bounding box for Overpass query
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
    boundary.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    })

    // Overpass QL to find relevant landmarks
    // Prioritizing: Neighborhoods, Parks, Schools, Public Buildings
    const overpassQuery = `
      [out:json][timeout:25];
      (
        node["place"~"neighbourhood|suburb|quarter"](${minLat},${minLng},${maxLat},${maxLng});
        way["place"~"neighbourhood|suburb|quarter"](${minLat},${minLng},${maxLat},${maxLng});
        relation["place"~"neighbourhood|suburb|quarter"](${minLat},${minLng},${maxLat},${maxLng});

        node["leisure"="park"](${minLat},${minLng},${maxLat},${maxLng});
        way["leisure"="park"](${minLat},${minLng},${maxLat},${maxLng});
        relation["leisure"="park"](${minLat},${minLng},${maxLat},${maxLng});

        node["amenity"~"school|university|college"](${minLat},${minLng},${maxLat},${maxLng});
        way["amenity"~"school|university|college"](${minLat},${minLng},${maxLat},${maxLng});
        relation["amenity"~"school|university|college"](${minLat},${minLng},${maxLat},${maxLng});
      );
      out center 5;
    `

    const overpassUrl = 'https://overpass-api.de/api/interpreter'
    const overrides = {
        method: 'POST',
        headers: {
            // User-Agent is required by Overpass API policy
            'User-Agent': 'CasaGrownApp/1.0 (internal-dev-testing)',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `data=${encodeURIComponent(overpassQuery)}`
    }

    const osmResponse = await fetch(overpassUrl, overrides)
    
    if (!osmResponse.ok) {
        console.error('Overpass API Error', await osmResponse.text())
        throw new Error('Failed to fetch from Overpass API')
    }

    const osmData = await osmResponse.json()
    const elements = osmData.elements || []

    // 4. Determine Name using Heuristic
    let bestName = `Community ${h3Index.substring(0, 6)}...`
    let nameSource = 'fallback_index'
    let city = 'Unknown'
    let state = null
    let country = null

    // Priority: Neighborhood > Park > School
    const neighborhoods = elements.filter(e => e.tags?.place && ['neighbourhood', 'suburb', 'quarter'].includes(e.tags.place))
    const parks = elements.filter(e => e.tags?.leisure === 'park')
    const schools = elements.filter(e => e.tags?.amenity && ['school', 'university', 'college'].includes(e.tags.amenity))

    if (neighborhoods.length > 0) {
        bestName = neighborhoods[0].tags.name || bestName
        nameSource = 'osm_neighborhood'
    } else if (parks.length > 0) {
        bestName = parks[0].tags.name || bestName
        nameSource = 'osm_park'
    } else if (schools.length > 0) {
        bestName = schools[0].tags.name || bestName
        nameSource = 'osm_school'
    }
    
    // Try to extract city/addr info if available
    const addrElement = elements.find(e => e.tags?.['addr:city'])
    if (addrElement) {
        city = addrElement.tags['addr:city']
    } else {
        // Fallback: If we have no city, we might need a reverse geocode, but for now defaulting.
        // In a real prod app, we'd do a reverse geocode call here too.
    }

    // 5. Insert into DB
    // Convert boundary to PostGIS Polygon format
    // Polygon string: "POLYGON((lng lat, lng lat, ...))" - Note: PostGIS uses LNG LAT order
    // H3 returns [lat, lng]
    const polygonPoints = boundary.map(([lat, lng]) => `${lng} ${lat}`).join(',')
    // Close the polygon by repeating the first point
    const firstPoint = boundary[0]
    const polygonString = `POLYGON((${polygonPoints}, ${firstPoint[1]} ${firstPoint[0]}))`
    
    const centroidPoint = `POINT(${lng} ${lat})`

    const newCommunity = {
        h3_index: h3Index,
        name: bestName,
        metadata: { source: nameSource, osm_elements_found: elements.length },
        city: city, // simplified
        location: centroidPoint, // WKT format for PostGIS
        boundary: polygonString, // WKT format
    }

    console.log('Inserting new community:', newCommunity)

    const { data: inserted, error: insertError } = await supabase
        .from('communities')
        .insert(newCommunity)
        .select()
        .single()

    if (insertError) {
        console.error('Insert Error:', insertError)
        // Handle race condition (another request created it)
        if (insertError.code === '23505') { // Unique violation
             const { data: retryData } = await supabase
                .from('communities')
                .select('*')
                .eq('h3_index', h3Index)
                .single()
             return new Response(JSON.stringify(retryData), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
             })
        }
        throw insertError
    }

    return new Response(JSON.stringify(inserted), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
