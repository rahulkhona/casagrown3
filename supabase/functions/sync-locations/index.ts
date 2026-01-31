import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // 1. Fetch Countries
    console.log('Fetching countries...')
    const response = await fetch('https://restcountries.com/v3.1/all')
    const countriesData = await response.json()

    const countries = countriesData.map((c: any) => ({
      iso_3: c.cca3,
      name: c.name.common,
      currency_symbol: c.currencies ? Object.values(c.currencies)[0].symbol : '$',
      phone_code: c.idd?.root ? `${c.idd.root}${c.idd.suffixes?.[0] || ''}` : '',
      updated_at: new Date()
    }))

    // 2. Upsert Countries
    const { error } = await supabase
      .from('countries')
      .upsert(countries, { onConflict: 'iso_3' })

    if (error) throw error

    return new Response(JSON.stringify({ 
      success: true, 
      count: countries.length, 
      message: 'Countries synced successfully' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
