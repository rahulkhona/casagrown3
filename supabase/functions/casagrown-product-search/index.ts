import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, zipcode, radius = 25 } = await req.json()

    if (!query || !zipcode) {
      return new Response(
        JSON.stringify({ error: 'query and zipcode are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
       throw new Error('Missing Supabase environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Call existing Postgres RPC
    // Note: Assuming search_market_products RPC exists and takes query, lat, lng, radius
    // Since we only have zipcode, we might need a geocoding step here or in the DB.
    // For now, we simulate the database response.
    
    // const { data, error } = await supabase.rpc('search_market_products', { search_term: query, zip: zipcode, search_radius: radius })
    
    const mockData = [
      {
        id: `casagrown-mock-1-${Date.now()}`,
        name: `Backyard ${query}`,
        description: `Homegrown ${query} picked this morning.`,
        price: 5.00,
        farm_name: "Neighbor Jane",
        farm_distance: "0.5 miles",
        external_url: null,
        image_url: "https://images.unsplash.com/photo-1595858712952-b8c78864f164?auto=format&fit=crop&w=400&q=80",
        source: 'casagrown'
      }
    ]

    return new Response(
      JSON.stringify({ data: mockData, source: 'casagrown' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
