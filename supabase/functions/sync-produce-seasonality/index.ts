import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'

// Gemini Fallback Chain: gemma-4-31b-it -> gemini-3.5-flash -> gemini-2.5-flash
const GEMINI_MODELS = ['gemma-4-31b-it', 'gemini-3.5-flash', 'gemini-2.5-flash']

async function queryGeminiSeasonality(produceName: string, apiKey: string): Promise<any[]> {
  const prompt = `You are an expert agricultural botanist.
For the garden produce crop "${produceName}", return the home gardener annual harvest start month (1-12) and end month (1-12) across key US agricultural states (CA, TX, FL, NY, WA, GA) plus a US_DEFAULT baseline.
Compute the pre_season_month as 1 month prior to start_month (e.g. if start_month is 5, pre_season_month is 4; if start_month is 1, pre_season_month is 12).

Respond ONLY with a valid JSON array of objects with keys: "state_code", "harvest_start_month", "harvest_end_month", "pre_season_month".
Example:
[
  {"state_code": "CA", "harvest_start_month": 5, "harvest_end_month": 9, "pre_season_month": 4},
  {"state_code": "US_DEFAULT", "harvest_start_month": 6, "harvest_end_month": 9, "pre_season_month": 5}
]`

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      })

      if (resp.ok) {
        const data = await resp.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          const parsed = JSON.parse(text)
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed
          }
        }
      }
    } catch (err) {
      console.warn(`[sync-produce-seasonality] Gemini ${model} failed, trying next fallback:`, err)
    }
  }

  // Baseline fallback if all AI calls fail
  return [
    { state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },
    { state_code: 'CA', harvest_start_month: 5, harvest_end_month: 10, pre_season_month: 4 }
  ]
}

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  try {
    const body = await req.json().catch(() => ({}))
    const produceList: string[] = body.produce_names && Array.isArray(body.produce_names)
      ? body.produce_names
      : []

    // If no specific produce passed, scan database for any unmapped produce in crm_produce_interests or market_products
    let missingProduces: string[] = []
    if (produceList.length > 0) {
      missingProduces = produceList.map(p => p.trim().toLowerCase()).filter(Boolean)
    } else {
      const { data: allInterests } = await supabase
        .from('crm_produce_interests')
        .select('produce_name')
        .eq('status', 'active')

      const { data: allProducts } = await supabase
        .from('market_products')
        .select('name')
        .eq('is_active', true)

      const names = new Set<string>()
      for (const r of (allInterests || [])) if (r.produce_name) names.add(r.produce_name.trim().toLowerCase())
      for (const r of (allProducts || [])) if (r.name) names.add(r.name.trim().toLowerCase())

      const { data: mapped } = await supabase
        .from('produce_seasonal_harvest_windows')
        .select('produce_name')

      const mappedSet = new Set((mapped || []).map((m: any) => m.produce_name.trim().toLowerCase()))
      missingProduces = Array.from(names).filter(n => !mappedSet.has(n))
    }

    if (missingProduces.length === 0) {
      return jsonOk({ synced: 0, message: 'All produce items are already mapped' }, corsHeaders)
    }

    const apiKey = env('GEMINI_API_KEY') || env('GOOGLE_GENERATIVE_AI_API_KEY') || ''
    let totalInserted = 0

    for (const prod of missingProduces.slice(0, 10)) { // limit to 10 per batch to prevent timeout
      const windows = await queryGeminiSeasonality(prod, apiKey)
      const rows = windows.map((w: any) => ({
        produce_name: prod,
        state_code: w.state_code || 'US_DEFAULT',
        harvest_start_month: Math.max(1, Math.min(12, parseInt(w.harvest_start_month) || 6)),
        harvest_end_month: Math.max(1, Math.min(12, parseInt(w.harvest_end_month) || 9)),
        pre_season_month: Math.max(1, Math.min(12, parseInt(w.pre_season_month) || 5)),
      }))

      const { error } = await supabase
        .from('produce_seasonal_harvest_windows')
        .upsert(rows, { onConflict: 'produce_name,state_code' })

      if (!error) totalInserted += rows.length
    }

    return jsonOk({ syncedProduces: missingProduces.length, rowsInserted: totalInserted }, corsHeaders)
  } catch (err: any) {
    console.error('[sync-produce-seasonality] Error:', err)
    return jsonError(err, corsHeaders)
  }
})
