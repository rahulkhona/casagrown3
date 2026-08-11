import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const BASE = 'https://www.usdalocalfoodportal.com/api'

async function fetchDirectory(dir: string, params: string, apiKey: string): Promise<any[]> {
  try {
    const url = `${BASE}/${dir}/?${params}&apikey=${apiKey}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
      }
    })
    if (!res.ok) {
      console.warn(`USDA ${dir} returned ${res.status}`)
      return []
    }
    const json = await res.json()
    const items = json.data || []
    // Tag each item with its source type
    return Array.isArray(items) ? items.map((item: any) => ({ ...item, _directory: dir })) : []
  } catch (e: any) {
    console.warn(`USDA ${dir} error:`, e.message)
    return []
  }
}

/** HEAD check a URL with a short timeout. Returns false if dead/404/unreachable. */
async function isWebsiteLive(rawUrl: string): Promise<boolean> {
  try {
    const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    // Accept any 2xx or 3xx — only reject hard 4xx/5xx
    return res.status < 400
  } catch {
    return false
  }
}

/** Nullify media_website for farms whose site is dead, in parallel. */
async function validateFarmWebsites(farms: any[]): Promise<any[]> {
  const checks = farms.map(async (farm) => {
    if (!farm.media_website) return farm
    const live = await isWebsiteLive(farm.media_website)
    return live ? farm : { ...farm, media_website: null }
  })
  return Promise.all(checks)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { zipcode, lat, lng, radius = 50, cacheKey } = await req.json()

    if (!zipcode && (lat == null || lng == null)) {
      return new Response(
        JSON.stringify({ error: 'zipcode or lat/lng is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanZip = zipcode ? zipcode.substring(0, 5) : null
    const targetKey = cacheKey || (cleanZip ? `usda_grid_zip_${cleanZip}` : (lat != null && lng != null) ? `usda_grid_${lat.toFixed(2)}_${lng.toFixed(2)}` : null)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    // 1. Check DB Cache first (returns in ~20ms if fresh < 7 days)
    if (targetKey && supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const { data: cached } = await supabase
          .from('usda_market_cache')
          .select('markets, farms, updated_at')
          .eq('cache_key', targetKey)
          .single()

        if (cached && Array.isArray(cached.markets) && cached.markets.length > 0) {
          const ageMs = Date.now() - new Date(cached.updated_at).getTime()
          const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
          if (ageMs < SEVEN_DAYS_MS) {
            const validatedOnfarm = (cached.farms || []).filter((f: any) => f._directory === 'onfarmmarket')
            const validatedCsas = (cached.farms || []).filter((f: any) => f._directory === 'csa')
            return new Response(
              JSON.stringify({
                data: cached.markets,
                farms: cached.farms || [],
                onfarm: validatedOnfarm,
                csas: validatedCsas,
                source: 'usda_db_cache',
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
      } catch (e: any) {
        console.warn('USDA DB cache lookup notice:', e.message)
      }
    }

    const apiKey = Deno.env.get('USDA_API_KEYS') || Deno.env.get('USDA_API_KEY') || ''
    if (!apiKey) {
      console.warn('USDA_API_KEY is not set')
    }

    // Build params: prefer zip if available, fall back to lat/lng
    const params = cleanZip
      ? `zip=${encodeURIComponent(cleanZip)}&radius=${radius}`
      : `lat=${lat}&lng=${lng}&radius=${radius}`

    // Fetch all three directories in parallel
    const [markets, onfarm, csas] = await Promise.all([
      fetchDirectory('farmersmarket', params, apiKey),
      fetchDirectory('onfarmmarket', params, apiKey),
      fetchDirectory('csa', params, apiKey),
    ])

    // Validate farm websites in parallel (nullifies dead URLs)
    const rawFarms = [...onfarm, ...csas]
    const farms = await validateFarmWebsites(rawFarms)

    // Split back for admin CRM
    const validatedOnfarm = farms.filter(f => f._directory === 'onfarmmarket')
    const validatedCsas = farms.filter(f => f._directory === 'csa')

    // Upsert into DB cache
    if (targetKey && supabaseUrl && supabaseServiceKey && (markets.length > 0 || farms.length > 0)) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        await supabase.from('usda_market_cache').upsert({
          cache_key: targetKey,
          zip_code: cleanZip,
          lat,
          lng,
          markets,
          farms,
          updated_at: new Date().toISOString(),
        })
      } catch (e: any) {
        console.warn('Failed to upsert usda_market_cache:', e.message)
      }
    }

    return new Response(
      JSON.stringify({
        data: markets,
        farms,
        onfarm: validatedOnfarm,
        csas: validatedCsas,
        source: 'usda_api',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
