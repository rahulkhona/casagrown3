import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Gemini Fallback Chain: gemma-4-31b-it -> gemini-3.5-flash -> gemini-2.5-flash
const GEMINI_MODELS = ['gemma-4-31b-it', 'gemini-3.5-flash', 'gemini-2.5-flash']

export async function queryGeminiSeasonality(produceName: string, apiKey: string): Promise<any[]> {
  const prompt = `You are an expert agricultural botanist.
For the garden produce crop "${produceName}", return the home gardener annual harvest start month (1-12) and end month (1-12) across key US agricultural states (CA, TX, FL, NY, WA, GA) plus a US_DEFAULT baseline.
Compute the pre_season_month as 1 month prior to start_month (e.g. if start_month is 5, pre_season_month is 4; if start_month is 1, pre_season_month is 12).

Respond ONLY with a valid JSON array of objects with keys: "state_code", "harvest_start_month", "harvest_end_month", "pre_season_month".
Example:
[
  {"state_code": "CA", "harvest_start_month": 5, "harvest_end_month": 9, "pre_season_month": 4},
  {"state_code": "US_DEFAULT", "harvest_start_month": 6, "harvest_end_month": 9, "pre_season_month": 5}
]`

  if (Deno.env.get('AI_MOCK') === 'true' || !apiKey || apiKey.startsWith('mock')) {
    return [
      { state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },
      { state_code: 'CA', harvest_start_month: 5, harvest_end_month: 10, pre_season_month: 4 }
    ]
  }

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
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
      console.warn(`[seasonality] Gemini ${model} failed, trying next fallback:`, err)
    }
  }

  // Baseline fallback if AI unavailable
  return [
    { state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },
    { state_code: 'CA', harvest_start_month: 5, harvest_end_month: 10, pre_season_month: 4 }
  ]
}

/**
 * Pre-flight auto-discovery: Finds any produce names in crm_produce_interests or market_products
 * that are missing from produce_seasonal_harvest_windows, queries Gemini, and saves them.
 */
export async function syncMissingProduceSeasonality(supabase: SupabaseClient, apiKey: string): Promise<number> {
  try {
    // 1. Get all unique produce names in system
    const { data: crmCrops } = await supabase
      .from('crm_produce_interests')
      .select('produce_name')
      .eq('status', 'active')

    const { data: marketCrops } = await supabase
      .from('market_products')
      .select('name')
      .eq('is_active', true)

    const allNames = new Set<string>()
    if (crmCrops) {
      crmCrops.forEach(c => {
        const clean = c.produce_name?.trim().toLowerCase()
        if (clean) allNames.add(clean)
      })
    }
    if (marketCrops) {
      marketCrops.forEach(m => {
        const clean = m.name?.trim().toLowerCase()
        if (clean) allNames.add(clean)
      })
    }

    if (allNames.size === 0) return 0

    // 2. Query known produce names in harvest windows
    const { data: existingWindows } = await supabase
      .from('produce_seasonal_harvest_windows')
      .select('produce_name')

    const knownNames = new Set<string>()
    if (existingWindows) {
      existingWindows.forEach(w => knownNames.add(w.produce_name?.trim().toLowerCase()))
    }

    const missingCrops = Array.from(allNames).filter(name => !knownNames.has(name))
    if (missingCrops.length === 0) return 0

    console.log(`[syncMissingProduceSeasonality] Discovered ${missingCrops.length} uncataloged crops:`, missingCrops)

    let insertedCount = 0
    for (const crop of missingCrops.slice(0, 10)) { // limit batch size per run
      const stateWindows = await queryGeminiSeasonality(crop, apiKey)
      const rows = stateWindows.map((w: any) => ({
        produce_name: crop,
        state_code: w.state_code || 'US_DEFAULT',
        harvest_start_month: Number(w.harvest_start_month) || 6,
        harvest_end_month: Number(w.harvest_end_month) || 9,
        pre_season_month: Number(w.pre_season_month) || 5,
        updated_at: new Date().toISOString()
      }))

      const { error } = await supabase
        .from('produce_seasonal_harvest_windows')
        .upsert(rows, { onConflict: 'produce_name, state_code' })

      if (!error) insertedCount += rows.length
    }

    return insertedCount
  } catch (err) {
    console.error('[syncMissingProduceSeasonality] Error:', err)
    return 0
  }
}
