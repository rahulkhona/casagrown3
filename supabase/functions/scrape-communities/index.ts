import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'

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

    // 1. Fetch a batch of zip codes
    // In a real scenario, we'd order by 'last_scraped_at' asc
    const { data: zipRows, error: fetchError } = await supabase
      .from('zip_codes')
      .select('zip_code, country_iso_3')
      .eq('country_iso_3', 'USA')
      .limit(10) // Small batch for testing/Edge limits

    if (fetchError) throw fetchError

    const allFoundCommunities = []
    const processedZips = []

    console.log(`Processing ${zipRows.length} zip codes...`)

    for (const row of zipRows) {
      const zip = row.zip_code
      processedZips.push(zip)
      
      // NCES Search URL (High Schools: Grade 10-13)
      const url = `https://nces.ed.gov/ccd/schoolsearch/school_list.asp?Search=1&Zip=${zip}&LoGrade=10&HiGrade=13&State=06` // State 06 (CA) hardcoded in example? 
      // The original data_model.md example had `State=06`.
      // NOTE: `State=06` is California. Removing it to search broadly or we need to map state codes.
      // For this implementation, I will remove `State=06` to allow zip-based search globally in US.
      const searchUrl = `https://nces.ed.gov/ccd/schoolsearch/school_list.asp?Search=1&Zip=${zip}&LoGrade=10&HiGrade=13`

      try {
        const response = await fetch(searchUrl)
        const html = await response.text()
        const doc = new DOMParser().parseFromString(html, 'text/html')
        
        if (!doc) continue

        const schoolLinks = doc.querySelectorAll('a[href^="school_detail.asp"]')
        
        for (const link of schoolLinks) {
             const name = link.textContent.trim()
             // Parent element text usually contains address: "Leland High, 6677 Camden Ave, San Jose, CA 95120"
             // Depending on DOM structure.
             // data_model logic:
             // const addressText = link.parentElement.innerText.replace(name, '').trim()
             // This is fragile but we'll stick to the plan.
             
             // Simplification: Just take the name and map to the current Zip.
             // We can allow duplicates (same school name in different zips is unlikely unless it's a chain, but community_name + zip is unique).
             
             // Check if we can parse city/state
             // Doing a best effort.
             
             allFoundCommunities.push({
                community_name: name,
                zip_code: zip,
                country_iso_3: 'USA'
             })
        }
        
        // Polite scraping delay
        await new Promise(resolve => setTimeout(resolve, 200))
        
      } catch (e) {
        console.error(`Failed to scrape ${zip}:`, e)
      }
    }

    // 2. Bulk UPSERT communities
    if (allFoundCommunities.length > 0) {
      console.log(`Upserting ${allFoundCommunities.length} communities...`)
      const { error: upsertError } = await supabase
        .from('communities')
        // We only have zip/name/country, relying on DB defaults
        .upsert(allFoundCommunities, { onConflict: 'zip_code, community_name, country_iso_3' })
      
      if (upsertError) throw upsertError
    }

    return new Response(JSON.stringify({ 
      success: true, 
      zips_processed: processedZips.length,
      communities_found: allFoundCommunities.length 
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
