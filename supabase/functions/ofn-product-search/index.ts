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
    const { query, zipcode, lat, lng, radius = 25 } = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: 'lat and lng are required for spatial search' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const radiusMeters = radius * 1609.34
    const latDelta = radius / 69
    const lngDelta = radius / (69 * Math.cos(lat * Math.PI / 180))

    // 1. Find nearby enterprises
    const { data: enterprises, error: entError } = await supabase
      .from('ofn_enterprises')
      .select('id, name, lat, lng')
      .gte('lat', lat - latDelta)
      .lte('lat', lat + latDelta)
      .gte('lng', lng - lngDelta)
      .lte('lng', lng + lngDelta)

    if (entError) throw entError

    const nearbyEnterpriseIds = []
    const entMap = new Map()
    for (const ent of enterprises || []) {
      if (!ent.lat || !ent.lng) continue
      const R = 3958.8 // Earth radius in miles
      const dLat = (ent.lat - lat) * Math.PI / 180
      const dLng = (ent.lng - lng) * Math.PI / 180
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat * Math.PI / 180) * Math.cos(ent.lat * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      const distance = R * c

      if (distance <= radius) {
        nearbyEnterpriseIds.push(ent.id)
        entMap.set(ent.id, { ...ent, distance_miles: distance })
      }
    }

    if (nearbyEnterpriseIds.length === 0) {
      return new Response(
        JSON.stringify({ data: [], source: 'openfoodnetwork' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Search products belonging to those enterprises
    const formattedQuery = query.trim().split(/\s+/).join(' | ')

    const { data: products, error: prodError } = await supabase
      .from('ofn_product_cache')
      .select('*')
      .in('enterprise_id', nearbyEnterpriseIds)
      .textSearch('text_search', formattedQuery)
      .limit(10)

    if (prodError) throw prodError

    // 3. Format response
    const searchResults = (products || []).map(p => {
      const ent = entMap.get(p.enterprise_id)
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        price_usd: p.price_usd,
        image_url: p.image_url,
        category: p.category,
        external_shop_url: `https://openfoodnetwork.net/groups/${ent.name.replace(/\s+/g, '-').toLowerCase()}`, // Mock URL for now
        enterprise_name: ent.name,
        distance_miles: ent.distance_miles
      }
    })

    // Sort by distance
    searchResults.sort((a, b) => a.distance_miles - b.distance_miles)

    return new Response(
      JSON.stringify({ data: searchResults, source: 'openfoodnetwork' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
