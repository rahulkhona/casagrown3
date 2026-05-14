import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { lat, lng, radius = 25, zipcode } = await req.json()

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: 'lat and lng are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Convert radius from miles to meters
    const radiusMeters = radius * 1609.34

    // Query ofn_enterprises within the radius using PostGIS
    // Since we don't have a specific RPC for this yet, we can use PostgREST with rpc or fallback to querying all and filtering if we can't do st_dwithin easily via the JS client without RPC.
    // Wait, the easiest way is to use an RPC. Let's assume we can create one or we just do a raw SQL if Deno allows it? Deno Supabase client doesn't do raw SQL. 
    // Wait! Let's just create an RPC function `get_nearby_ofn_enterprises` OR filter in memory if the cache is small enough.
    // Actually, we can just do a bounding box filter using `lat` and `lng` and `radius` if we don't want an RPC.
    // 1 degree latitude = ~69 miles.
    const latDelta = radius / 69
    const lngDelta = radius / (69 * Math.cos(lat * Math.PI / 180))

    const { data: prospects, error } = await supabase
      .from('ofn_enterprises')
      .select('*')
      .gte('lat', lat - latDelta)
      .lte('lat', lat + latDelta)
      .gte('lng', lng - lngDelta)
      .lte('lng', lng + lngDelta)

    if (error) throw error

    // Refine distance calculation in memory
    const refinedProspects = []
    for (const p of prospects || []) {
      if (!p.lat || !p.lng) continue
      
      const R = 3958.8 // Earth radius in miles
      const dLat = (p.lat - lat) * Math.PI / 180
      const dLng = (p.lng - lng) * Math.PI / 180
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      const distance = R * c

      if (distance <= radius) {
        refinedProspects.push({
          ...p,
          distance_miles: distance
        })
      }
    }

    // Sort by distance
    refinedProspects.sort((a, b) => a.distance_miles - b.distance_miles)

    return new Response(
      JSON.stringify({ data: refinedProspects }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
