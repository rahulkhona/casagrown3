import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { latLngToCell, cellToBoundary, gridDisk } from 'npm:h3-js'

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

    const requestBody = await req.json()
    let { lat, lng, address } = requestBody

    // 0. Geocoding (if address provided)
    if (address && (!lat || !lng)) {
      console.log(`Geocoding address: "${address}"...`)
      const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search')
      nominatimUrl.searchParams.set('q', address)
      nominatimUrl.searchParams.set('format', 'json')
      nominatimUrl.searchParams.set('limit', '1')

      const geoResponse = await fetch(nominatimUrl.toString(), {
        headers: { 
            // Nominatim requires a valid User-Agent
            'User-Agent': 'CasaGrownApp/1.0 (internal-dev-testing)' 
        }
      })

      if (!geoResponse.ok) throw new Error('Geocoding service failed')
      
      const geoData = await geoResponse.json()
      if (!geoData || geoData.length === 0) {
        throw new Error('Address not found')
      }

      lat = parseFloat(geoData[0].lat)
      lng = parseFloat(geoData[0].lon)
      console.log(`Resolved "${address}" to (${lat}, ${lng})`)
    }

    if (!lat || !lng) {
      throw new Error('Missing location data (lat/lng or address)')
    }

    // 1. Calculate Primary H3 Index (Resolution 7)
    const h3Index = latLngToCell(lat, lng, 7)
    console.log(`Resolved H3 Index: ${h3Index} for location (${lat}, ${lng})`)

    // Calculate Neighbors (k=1)
    const neighborIndices = gridDisk(h3Index, 1) // Returns origin + 6 neighbors
    // Filter out the origin itself for the "neighbors" list
    const adjacentIndices = neighborIndices.filter(idx => idx !== h3Index)

    // 2. Resolver Function (DB Check -> Overpass Gen)
    const resolveCommunity = async (index: string, location?: {lat: number, lng: number}) => {
        // Check DB
        const { data: existing, error } = await supabase
            .from('communities')
            .select('*')
            .eq('h3_index', index)
            .single()

        if (existing && !error) return existing

        // If missing, Generate via Overpass
        console.log(`Generating community for ${index}...`)
        const boundary = cellToBoundary(index) // [lat, lng][]
        
        // Bounding box
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
        boundary.forEach(([lat, lng]) => {
            if (lat < minLat) minLat = lat
            if (lat > maxLat) maxLat = lat
            if (lng < minLng) minLng = lng
            if (lng > maxLng) maxLng = lng
        })

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
        const osmResponse = await fetch(overpassUrl, {
            method: 'POST',
            headers: {
                'User-Agent': 'CasaGrownApp/1.0 (internal-dev-testing)',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `data=${encodeURIComponent(overpassQuery)}`
        })
        
        if (!osmResponse.ok) throw new Error('Overpass API Failed')
        const osmData = await osmResponse.json()
        const elements = osmData.elements || []

        // Naming Heuristic
        let bestName = `Community ${index.substring(0, 6)}...`
        let nameSource = 'fallback_index'
        let city = 'Unknown'

        const neighborhoods = elements.filter((e: any) => e.tags?.place && ['neighbourhood', 'suburb', 'quarter'].includes(e.tags.place))
        const parks = elements.filter((e: any) => e.tags?.leisure === 'park')
        const schools = elements.filter((e: any) => e.tags?.amenity && ['school', 'university', 'college'].includes(e.tags.amenity))

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
        
        const addrElement = elements.find((e: any) => e.tags?.['addr:city'])
        if (addrElement) city = addrElement.tags['addr:city']

        // Create Geometry WKT
        const polygonPoints = boundary.map(([lat, lng]) => `${lng} ${lat}`).join(',')
        const firstPoint = boundary[0]
        const polygonString = `POLYGON((${polygonPoints}, ${firstPoint[1]} ${firstPoint[0]}))`
        
        // Use provided location centroid or cell center
        const cellCenter = location || { lat: (minLat+maxLat)/2, lng: (minLng+maxLng)/2 }
        const centroidPoint = `POINT(${cellCenter.lng} ${cellCenter.lat})`

        const newCommunity = {
            h3_index: index,
            name: bestName,
            metadata: { source: nameSource, osm_elements_found: elements.length },
            city: city,
            location: centroidPoint,
            boundary: polygonString,
        }

        const { data: inserted, error: insertError } = await supabase
            .from('communities')
            .insert(newCommunity)
            .select()
            .single()

        if (insertError) {
             if (insertError.code === '23505') { // Retrieve if concurrent insert
                 const { data: retry } = await supabase.from('communities').select('*').eq('h3_index', index).single()
                 return retry
             }
             throw insertError
        }
        return inserted
    }

    // 3. Resolve Primary Community (Ensured to exist)
    const primaryCommunity = await resolveCommunity(h3Index, { lat, lng })

    // 4. Resolve Neighbors (Best effort / Indices)
    // For now, we will return just the indices to keep it fast.
    // Use can query the DB for details or we can do a bulk fetch.
    // Let's do a bulk fetch from DB to see which ones exist.
    const { data: existingNeighbors } = await supabase
        .from('communities')
        .select('h3_index, name')
        .in('h3_index', adjacentIndices)
    
    // Map neighbors: If exists in DB, use name. If not, just return Index + placeholder.
    const neighbors = adjacentIndices.map(idx => {
        const found = existingNeighbors?.find(n => n.h3_index === idx)
        return {
            h3_index: idx,
            name: found ? found.name : 'Unexplored Community', 
            status: found ? 'active' : 'unexplored' // UI can trigger exploration if needed
        }
    })

    return new Response(JSON.stringify({
      primary: primaryCommunity,
      neighbors: neighbors, 
      resolved_location: { lat, lng }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
