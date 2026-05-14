import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
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

    // Step 1: Find enterprises near the zipcode.
    // Note: Since OFN DFC API doesn't have a single universal catalog search, 
    // we query enterprises first, then aggregate their catalog items.
    const enterprisesUrl = `https://openfoodnetwork.net/api/dfc/enterprises`
    
    let enterprisesData = null;
    try {
      const enterprisesRes = await fetch(enterprisesUrl, { headers })
      if (enterprisesRes.ok) {
        enterprisesData = await enterprisesRes.json()
      } else {
        console.warn(`OFN API Error: ${enterprisesRes.statusText}. Falling back to mock data.`)
      }
    } catch (e) {
      console.warn(`OFN API Fetch Failed: ${e.message}. Falling back to mock data.`)
    }

    // Mocking the filtering and catalog mapping for now since DFC API requires nested calls
    // In production with actual OFN data, you would map over these enterprises to `/catalog_items`
    // filtering by distance based on lat/lng coordinates.
    
    // Return empty results until OFN API key is obtained
    const searchResults: any[] = []

    return new Response(
      JSON.stringify({ data: searchResults, source: 'openfoodnetwork' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
