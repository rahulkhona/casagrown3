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

    // Parse request body for config
    let limit = 10
    try {
      const body = await req.json()
      if (body.limit) limit = body.limit
    } catch {
      // no body or invalid json, use default
    }

    // 1. Fetch a batch of zip codes that don't have community entries yet
    // Using a subquery approach (assuming the DB supports it) or a LEFT JOIN logic
    const { data: zipRows, error: fetchError } = await supabase.rpc('get_zips_without_communities', { batch_size: limit })
    
    // NOTE: If RPC is not available, we fall back to a simple select
    let zipsToProcess = zipRows
    if (fetchError || !zipRows) {
        console.log('RPC failed or returned empty, falling back to basic select')
        const { data: fallbackZips } = await supabase
          .from('zip_codes')
          .select('zip_code, country_iso_3')
          .eq('country_iso_3', 'USA')
          .limit(50)
        zipsToProcess = fallbackZips || []
    }

    const allFoundCommunities = []
    const processedZips = []

    console.log(`Processing ${zipsToProcess.length} zip codes...`)

    const scrapingLogs = []

    for (const row of zipsToProcess) {
      const zip = row.zip_code
      processedZips.push(zip)
      
      const searchUrl = `https://nces.ed.gov/ccd/schoolsearch/school_list.asp?Search=1&Zip=${zip}&LoGrade=10&HiGrade=13`

      try {
        const response = await fetch(searchUrl)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        
        const html = await response.text()
        const doc = new DOMParser().parseFromString(html, 'text/html')
        
        if (!doc) {
            scrapingLogs.push({ zip_code: zip, country_iso_3: 'USA', status: 'failure', error_message: 'Failed to parse DOM' })
            continue
        }

        const schoolLinks = doc.querySelectorAll('a[href^="school_detail.asp"]')
        const batchFound = []
        
        for (const link of schoolLinks) {
             const name = link.textContent.trim()
             batchFound.push({
                community_name: name,
                zip_code: zip,
                country_iso_3: 'USA'
             })
        }

        allFoundCommunities.push(...batchFound)
        scrapingLogs.push({ 
            zip_code: zip, 
            country_iso_3: 'USA', 
            status: batchFound.length > 0 ? 'success' : 'zero_results',
            communities_count: batchFound.length
        })
        
        // Polite scraping delay
        await new Promise(resolve => setTimeout(resolve, 200))
        
      } catch (e: any) {
        console.error(`Failed to scrape ${zip}:`, e)
        scrapingLogs.push({ zip_code: zip, country_iso_3: 'USA', status: 'failure', error_message: e.message })
      }
    }

    // 2. Bulk UPSERT communities
    if (allFoundCommunities.length > 0) {
      // Deduplicate before upsert to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time"
      const uniqueMap = new Map()
      for (const item of allFoundCommunities) {
        const key = `${item.zip_code}:${item.community_name}:${item.country_iso_3}`
        uniqueMap.set(key, item)
      }
      const deduplicated = Array.from(uniqueMap.values())

      console.log(`Upserting ${deduplicated.length} unique communities (filtered ${allFoundCommunities.length - deduplicated.length} duplicates)...`)
      
      const { error: upsertError } = await supabase
        .from('communities')
        .upsert(deduplicated, { onConflict: 'zip_code, community_name, country_iso_3' })
      
      if (upsertError) throw upsertError
    }

    // 3. Mark zips as scraped
    if (processedZips.length > 0) {
      console.log(`Updating last_scraped_at for ${processedZips.length} zips...`)
      await supabase
        .from('zip_codes')
        .update({ last_scraped_at: new Date() })
        .in('zip_code', processedZips)
        .eq('country_iso_3', 'USA')
      
      // 4. Record logs
      console.log('Recording scraping health logs...')
      await supabase.from('scraping_logs').insert(scrapingLogs)
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
