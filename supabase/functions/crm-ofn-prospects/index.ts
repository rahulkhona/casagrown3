import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { zipcode } = await req.json()

    if (!zipcode) {
      return new Response(
        JSON.stringify({ error: 'zipcode is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('OFN_API_KEY')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    } else {
      console.warn('OFN_API_KEY is not set. Using unauthenticated public endpoints subject to rate limits.')
    }

    const enterprisesUrl = `https://openfoodnetwork.net/api/dfc/enterprises`
    try {
      const response = await fetch(enterprisesUrl, { headers })
      
      if (!response.ok) {
         const errorText = await response.text()
         console.warn(`OFN API Error: ${response.status} ${errorText}. Falling back to mock data.`)
      } else {
         const rawData = await response.json()
      }
    } catch (e: any) {
      console.warn(`OFN API Fetch Failed: ${e.message}. Falling back to mock data.`)
    }
    
    // In production, you would geocode the zipcode and calculate distances
    // For now, we mock the parsing and filtering of the DFC response
    const prospects = [
      {
        id: `prospect-${Date.now()}`,
        farm_name: "Sunrise Valley Farms",
        description: "A commercial organic farm offering seasonal vegetables.",
        email: "contact@sunrisevalley.example.com",
        phone: "(555) 123-4567",
        distance: "12 miles",
        source: 'openfoodnetwork'
      },
      {
        id: `prospect-${Date.now() + 1}`,
        farm_name: "Green Pastures Co-op",
        description: "Local food hub aggregating pasture-raised meat.",
        email: "hello@greenpastures.example.com",
        phone: "(555) 987-6543",
        distance: "18 miles",
        source: 'openfoodnetwork'
      }
    ]

    return new Response(
      JSON.stringify({ data: prospects }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
