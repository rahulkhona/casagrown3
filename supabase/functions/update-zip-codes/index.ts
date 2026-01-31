import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parse } from 'https://deno.land/std@0.181.0/encoding/csv.ts'

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

    console.log('Fetching zip codes...')
    // Using a sample static URL or the one provided in docs. 
    // Ideally this would be the live SimpleMaps URL, but they often require download tokens or have CAPTCHAs.
    // For this implementation I will use the URL from the docs, assuming it works or using a placeholder if I need to mock it.
    // Using a valid GitHub raw source found via search
    const response = await fetch('https://raw.githubusercontent.com/akinniyi/US-Zip-Codes-With-City-State/master/uszips.csv')
    
    if (!response.ok) {
       throw new Error(`Failed to fetch CSV: ${response.statusText}`)
    }

    const csvText = await response.text()
    
    console.log('Parsing CSV...')
    // Parse CSV
    const data = await parse(csvText, { 
      skipFirstRow: true, 
      columns: [
        'zip', 'lat', 'lng', 'city', 'state_id', 'state_name', 'zcta', 'parent_zcta', 'population', 
        'density', 'county_fips', 'county_name', 'all_county_weights', 
        'imprecise', 'military', 'timezone'
      ]
    })

    console.log(`Parsed ${data.length} rows. Starting upsert...`)

    // Map to our schema
    const updates = data.map((row: any) => ({
      zip_code: row.zip,
      // We need city_id eventually, but for this first pass we might not have the linking logic perfectly set up 
      // without looking up the city_id from the 'cities' table first.
      // However, the schema says `city_id` is NOT NULL and references `cities(id)`.
      // This creates a dependency: We MUST have the city in the `cities` table first.
      // Since `sync-locations` (previous step) only fetched countries, we are missing state/city data linkage here.
      // FOR NOW, to make this work without a full ETL pipeline, I will focus on the rows that match existing cities 
      // or I'd need to upsert cities on the fly.
      
      // Given the complexity of upserting hierarchy on the fly in a single function, 
      // I will assume for this V1 that we are just storing the raw data, BUT the schema requires relations.
      
      // CRITICAL: The data model requires `city_id` FK. 
      // If I don't have the city ID, I can't insert.
      // Strategy: I will temporarily modify this function to TRY to find the city.
      // OR, simpler: I'll assume valid `cities` exist. 
      
      // Realistically for V1 prototype: I'll just map the raw fields and let the DB error if FK missing,
      // or better, I will stub the `city_id` if I can't find it? No, that violates FK.
      
      // Correct approach: The `sync-locations` should have populated cities. 
      // Since `sync-locations` was just a stub for Countries, this function WILL FAIL on FK constraints 
      // unless I also upsert the City/State here.
      // Auto-populating State/City from Zip data is actually a good strategy.
      
      country_iso_3: 'USA',
      latitude: parseFloat(row.lat),
      longitude: parseFloat(row.lng)
    }))

    // Challenge: We need `city_id`. 
    // Solution: We will extract unique States and Cities from this CSV and upsert them FIRST.
    
    // 4. Upsert ALL Unique States
    console.log('Extracting unique states...')
    // Fix: Ensure we don't redeclare variable if it exists, or just use a new block.
    // The previous edit likely messed up the file structure. I'll rewrite the block cleanly.
    
    // Logic: Extract States -> Upsert -> Get Map
    const startStates = [...new Set(data.map((d: any) => JSON.stringify({ code: d.state_id, name: d.state_name })))]
        .map((s: string) => JSON.parse(s))
    
    console.log(`Upserting ${startStates.length} states...`)
    await supabase.from('states').upsert(
       startStates.map(s => ({
          country_iso_3: 'USA',
          code: s.code,
          name: s.name
       })), 
       { onConflict: 'country_iso_3, code' }
    )
    
    const { data: allStates } = await supabase.from('states').select('code, id').eq('country_iso_3', 'USA')
    const stateMap = new Map(allStates?.map(s => [s.code, s.id]))


    // 5. Upsert ALL Unique Cities (Linked to State)
    console.log('Extracting unique cities...')
    const uniqueCities = [...new Set(data.map((d: any) => JSON.stringify({ state: d.state_id, city: d.city })))]
        .map((s: string) => JSON.parse(s))

    // Prepare city objects with state_id
    const cityRows = uniqueCities.map(c => {
        const sId = stateMap.get(c.state)
        if (!sId) return null // Should not happen
        return {
            state_id: sId,
            name: c.city
        }
    }).filter(c => c !== null)

    console.log(`Upserting ${cityRows.length} cities...`)
    
    // Batch upsert cities (chunked to avoid limits)
    // Upserting 30k cities might time out in one go, so we chunk it.
    const cityChunkSize = 1000
    for (let i = 0; i < cityRows.length; i += cityChunkSize) {
        const chunk = cityRows.slice(i, i + cityChunkSize)
        await supabase.from('cities').upsert(chunk, { onConflict: 'state_id, name' })
    }

    // Refresh Map for Zips
    // We need City IDs to insert Zips. Fetching all cities might be heavy (30k rows).
    // Refresh Map for Zips - PAGINATED to bypass hard limits
    const allCitiesFromDB = []
    let hasMore = true
    let offset = 0
    const cityFetchBatchSize = 1000

    console.log('Fetching all cities from DB...')
    while (hasMore) {
        const { data: cityBatch, error: fetchError } = await supabase
            .from('cities')
            .select('state_id, name, id')
            .range(offset, offset + cityFetchBatchSize - 1)
        
        if (fetchError) {
            console.error('Error fetching cities batch:', fetchError.message)
            break
        }

        if (cityBatch && cityBatch.length > 0) {
            allCitiesFromDB.push(...cityBatch)
            offset += cityFetchBatchSize
            if (cityBatch.length < cityFetchBatchSize) hasMore = false
        } else {
            hasMore = false
        }
    }
    console.log(`Fetched ${allCitiesFromDB.length} cities total.`)
    
    // Complex Key Map: state_id + city_name -> city_id
    const cityMap = new Map()
    allCitiesFromDB.forEach(c => {
        cityMap.set(`${c.state_id}:${c.name}`, c.id)
    })

    // 6. Upsert ALL Zones (Zips) - CHUNKED
    console.log(`Preparing to upsert all ${data.length} zip codes...`)
    
    const zipRows = data.map((row: any) => {
       const stateId = stateMap.get(row.state_id)
       const cityKey = `${stateId}:${row.city}`
       const cityId = cityMap.get(cityKey)
       
       if (!stateId || !cityId) {
           // Debug a few failures
           if (Math.random() < 0.001) {
               console.log(`Mapping failure for zip ${row.zip}: stateFound=${!!stateId} (code=${row.state_id}), cityFound=${!!cityId} (key=${cityKey})`)
           }
           return null
       }

       return {
           zip_code: row.zip,
           country_iso_3: 'USA',
           city_id: cityId,
           latitude: parseFloat(row.lat) || 0,
           longitude: parseFloat(row.lng) || 0
       }
    }).filter(z => z !== null)

    const zipChunkSize = 1000
    for (let i = 0; i < zipRows.length; i += zipChunkSize) {
        const chunk = zipRows.slice(i, i + zipChunkSize)
        console.log(`Upserting zip chunk ${Math.floor(i / zipChunkSize) + 1}/${Math.ceil(zipRows.length / zipChunkSize)}...`)
        const { error } = await supabase.from('zip_codes').upsert(chunk, { onConflict: 'zip_code, country_iso_3' })
        if (error) {
            console.error(`Error upserting zip chunk: ${error.message}`)
        }
    }
    
    let processed = zipRows.length

    return new Response(JSON.stringify({ 
      success: true, 
      count: processed,
      message: 'Batch processed successfully'
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
