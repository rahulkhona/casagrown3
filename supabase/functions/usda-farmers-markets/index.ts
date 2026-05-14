import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
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
    const { zipcode, radius = 50 } = await req.json()

    if (!zipcode) {
      return new Response(
        JSON.stringify({ error: 'zipcode is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('USDA_API_KEY') || ''
    if (!apiKey) {
      console.warn('USDA_API_KEY is not set')
    }

    const params = `zip=${encodeURIComponent(zipcode)}&radius=${radius}`

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

    return new Response(
      JSON.stringify({
        // Backward-compatible: `data` is still the farmers markets array
        data: markets,
        // New: individual farms (on-farm markets + CSAs) with validated websites
        farms,
        // Detailed breakdown for admin CRM
        onfarm: validatedOnfarm,
        csas: validatedCsas,
        source: 'usda',
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
