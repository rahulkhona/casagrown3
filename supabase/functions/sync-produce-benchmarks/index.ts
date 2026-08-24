import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'

export interface BenchmarkResult {
  produce_name: string
  zip_code: string
  avg_retail_price: number
  suggested_price: number
  unit: string
  source: 'kroger' | 'usda_ams' | 'catalog_default'
}

export const TOP_PRODUCE_ITEMS = [
  { name: 'Tomatoes', unit: 'lb', defaultRetail: 1.29, defaultWholesale: 0.60 },
  { name: 'Lemons', unit: 'each', defaultRetail: 0.79, defaultWholesale: 0.15 },
  { name: 'Avocados', unit: 'each', defaultRetail: 1.50, defaultWholesale: 0.65 },
  { name: 'Strawberries', unit: 'lb', defaultRetail: 3.49, defaultWholesale: 1.80 },
  { name: 'Peaches', unit: 'lb', defaultRetail: 3.50, defaultWholesale: 1.60 },
  { name: 'Zucchini', unit: 'lb', defaultRetail: 1.69, defaultWholesale: 0.33 },
  { name: 'Kale', unit: 'bunch', defaultRetail: 1.99, defaultWholesale: 0.80 },
  { name: 'Basil', unit: 'bunch', defaultRetail: 2.49, defaultWholesale: 0.80 },
  { name: 'Sweet Corn', unit: 'each', defaultRetail: 0.75, defaultWholesale: 0.12 },
  { name: 'Eggs', unit: 'dozen', defaultRetail: 2.99, defaultWholesale: 1.50 },
  { name: 'Honey', unit: 'jar', defaultRetail: 4.99, defaultWholesale: 2.50 },
]

// Terminal market report slugs by region
const TERMINAL_SLUGS: Record<string, { fruit: string; veg: string }> = {
  CA: { fruit: '2337', veg: '2338' },
  WA: { fruit: '2337', veg: '2338' },
  OR: { fruit: '2337', veg: '2338' },
  NV: { fruit: '2289', veg: '2290' },
  AZ: { fruit: '2289', veg: '2290' },
  TX: { fruit: '2285', veg: '2286' },
  GA: { fruit: '2277', veg: '2278' },
  FL: { fruit: '2277', veg: '2278' },
  IL: { fruit: '2283', veg: '2284' },
  NY: { fruit: '2293', veg: '2294' },
  DEFAULT: { fruit: '2337', veg: '2338' },
}

async function getKrogerToken(clientId: string, clientSecret: string): Promise<string | null> {
  try {
    const authHeader = btoa(`${clientId}:${clientSecret}`)
    const resp = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
      body: 'grant_type=client_credentials&scope=product.compact',
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.access_token || null
  } catch (e) {
    console.warn('[KROGER] Token fetch error:', e)
    return null
  }
}

async function fetchKrogerPrice(
  token: string,
  produceName: string,
  zipCode: string
): Promise<{ retailPrice: number; unit: string } | null> {
  try {
    // 1. Get Location
    const locResp = await fetch(
      `https://api.kroger.com/v1/locations?filter.zipCode.near=${encodeURIComponent(zipCode)}&filter.limit=1`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    )
    if (!locResp.ok) return null
    const locData = await locResp.json()
    const locId = locData.data?.[0]?.locationId
    if (!locId) return null

    // 2. Search Product
    const prodResp = await fetch(
      `https://api.kroger.com/v1/products?filter.term=${encodeURIComponent(produceName)}&filter.locationId=${locId}&filter.limit=3`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    )
    if (!prodResp.ok) return null
    const prodData = await prodResp.json()
    const item = prodData.data?.[0]
    if (!item) return null

    const priceInfo = item.items?.[0]?.price
    const price = priceInfo?.regular || priceInfo?.promo
    if (!price || typeof price !== 'number') return null

    const soldBy = item.items?.[0]?.soldBy || 'UNIT'
    const unit = soldBy.toLowerCase() === 'weight' ? 'lb' : 'each'

    return { retailPrice: price, unit }
  } catch (e) {
    console.warn('[KROGER] Price lookup error:', e)
    return null
  }
}

async function fetchUSDAPrice(
  apiKey: string,
  produceName: string,
  state: string = 'DEFAULT'
): Promise<{ wholesalePrice: number; unit: string } | null> {
  try {
    const slugs = (state ? TERMINAL_SLUGS[state.toUpperCase()] : undefined) || TERMINAL_SLUGS.DEFAULT || { fruit: '2337', veg: '2338' }
    const authHeader = btoa(`${apiKey}:`)
    const secName = encodeURIComponent('Report Details')
    
    // Try fruit report then veg report
    for (const slug of [slugs.fruit, slugs.veg]) {
      const url = `https://marsapi.ams.usda.gov/services/v1.2/reports/${slug}/${secName}?lastRepDate=true`
      const resp = await fetch(url, {
        headers: { Authorization: `Basic ${authHeader}`, Accept: 'application/json' },
      })
      if (!resp.ok) continue
      const data = await resp.json()
      const results = data.results || []

      for (const r of results) {
        const comm = (r.commodity || '').toLowerCase()
        if (comm.includes(produceName.toLowerCase()) || produceName.toLowerCase().includes(comm)) {
          const low = parseFloat(r.low_price)
          const high = parseFloat(r.high_price) || low
          if (!isNaN(low) && low > 0) {
            const avg = (low + high) / 2
            const pkg = (r.package || '').toLowerCase()
            let unitPrice = avg
            let unit = 'lb'
            if (pkg.includes('carton') || pkg.includes('box') || pkg.includes('crate')) {
              unitPrice = Math.round((avg / 25) * 100) / 100
            } else if (pkg.includes('bunch') || pkg.includes('container')) {
              unitPrice = Math.round((avg / 10) * 100) / 100
              unit = 'bunch'
            }
            return { wholesalePrice: unitPrice, unit }
          }
        }
      }
    }
    return null
  } catch (e) {
    console.warn('[USDA] Wholesale price lookup error:', e)
    return null
  }
}

export async function resolveBenchmark(
  produceName: string,
  zipCode: string,
  krogerToken: string | null,
  usdaKey: string | null,
  isMock: boolean = false
): Promise<BenchmarkResult> {
  // 1. MOCK MODE for CI / local test isolation
  if (isMock) {
    const item = TOP_PRODUCE_ITEMS.find(
      i => i.name.toLowerCase() === produceName.toLowerCase()
    ) || TOP_PRODUCE_ITEMS[0] || { name: produceName, unit: 'lb', defaultRetail: 1.29, defaultWholesale: 0.60 }

    if (zipCode === '90210' || zipCode === '75001' || zipCode === '30301') {
      const retail = item.defaultRetail
      const suggested = Math.round(retail * 0.80 * 100) / 100 // 20% discount
      return {
        produce_name: produceName,
        zip_code: zipCode,
        avg_retail_price: retail,
        suggested_price: suggested,
        unit: item.unit,
        source: 'kroger',
      }
    } else {
      const wholesale = item.defaultWholesale
      const suggested = Math.round(wholesale * 1.50 * 100) / 100 // 1.5x markup
      return {
        produce_name: produceName,
        zip_code: zipCode,
        avg_retail_price: Math.round(wholesale * 2.0 * 100) / 100,
        suggested_price: suggested,
        unit: item.unit,
        source: 'usda_ams',
      }
    }
  }

  // 2. LIVE KROGER LOOKUP (20% discount)
  if (krogerToken) {
    const krogerRes = await fetchKrogerPrice(krogerToken, produceName, zipCode)
    if (krogerRes) {
      const suggested = Math.round(krogerRes.retailPrice * 0.80 * 100) / 100
      return {
        produce_name: produceName,
        zip_code: zipCode,
        avg_retail_price: krogerRes.retailPrice,
        suggested_price: suggested,
        unit: krogerRes.unit,
        source: 'kroger',
      }
    }
  }

  // 3. LIVE USDA AMS LOOKUP (1.5x markup)
  if (usdaKey) {
    const usdaRes = await fetchUSDAPrice(usdaKey, produceName)
    if (usdaRes) {
      const suggested = Math.round(usdaRes.wholesalePrice * 1.50 * 100) / 100
      return {
        produce_name: produceName,
        zip_code: zipCode,
        avg_retail_price: Math.round(usdaRes.wholesalePrice * 2.0 * 100) / 100,
        suggested_price: suggested,
        unit: usdaRes.unit,
        source: 'usda_ams',
      }
    }
  }

  // 4. CANONICAL CATALOG FALLBACK
  const defaultItem = TOP_PRODUCE_ITEMS.find(
    i => i.name.toLowerCase() === produceName.toLowerCase()
  ) || { name: produceName, unit: 'item', defaultRetail: 2.50, defaultWholesale: 1.00 }

  return {
    produce_name: produceName,
    zip_code: zipCode,
    avg_retail_price: defaultItem.defaultRetail,
    suggested_price: Math.round(defaultItem.defaultRetail * 0.80 * 100) / 100,
    unit: defaultItem.unit,
    source: 'catalog_default',
  }
}

serveWithCors(async (req, { supabase, corsHeaders }) => {
  const krogerId = Deno.env.get('KROGER_CLIENT_ID') || 'casagrown-bbchvmkv'
  const krogerSecret = Deno.env.get('KROGER_CLIENT_SECRET') || 'KF9dfzWtpJANBbE3mNnRvxkuwGHQcNVpXZjtDf9n'
  const usdaKey = Deno.env.get('USDA_AMS_API_KEY') || 'oK/SXE39wQhdCVgEEPmtc8CTihkPQPXS'
  const isMock = Deno.env.get('AI_MOCK') === 'true'

  const krogerToken = isMock ? null : await getKrogerToken(krogerId, krogerSecret)
  const body = await req.json().catch(() => ({}))

  // SINGLE ON-DEMAND MODE
  if (body.mode === 'single' && body.produce_name && body.zip_code) {
    const benchmark = await resolveBenchmark(
      body.produce_name,
      body.zip_code,
      krogerToken,
      usdaKey,
      isMock
    )

    await supabase.from('market_price_benchmarks').upsert(
      {
        produce_name: benchmark.produce_name,
        zip_code: benchmark.zip_code,
        avg_retail_price: benchmark.avg_retail_price,
        suggested_price: benchmark.suggested_price,
        unit: benchmark.unit,
        source: benchmark.source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'produce_name,zip_code' }
    )

    return jsonOk({ success: true, benchmark }, corsHeaders)
  }

  // BATCH CRON MODE
  const { data: activeBooths } = await supabase
    .from('market_booths')
    .select('booth_zip, delivery_zipcodes')
    .eq('status', 'active')

  const activeZips = new Set<string>(['95120', '90210', '75001', '30301', '97201', '80202'])
  if (activeBooths) {
    for (const b of activeBooths) {
      if (b.booth_zip) activeZips.add(b.booth_zip)
      if (Array.isArray(b.delivery_zipcodes)) {
        b.delivery_zipcodes.forEach((z: string) => z && activeZips.add(z))
      }
    }
  }

  const insertedBenchmarks: BenchmarkResult[] = []
  for (const zip of Array.from(activeZips).slice(0, 10)) {
    for (const crop of TOP_PRODUCE_ITEMS) {
      const benchmark = await resolveBenchmark(
        crop.name,
        zip,
        krogerToken,
        usdaKey,
        isMock
      )
      insertedBenchmarks.push(benchmark)

      await supabase.from('market_price_benchmarks').upsert(
        {
          produce_name: benchmark.produce_name,
          zip_code: benchmark.zip_code,
          avg_retail_price: benchmark.avg_retail_price,
          suggested_price: benchmark.suggested_price,
          unit: benchmark.unit,
          source: benchmark.source,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'produce_name,zip_code' }
      )
    }
  }

  return jsonOk(
    {
      success: true,
      zips_synced: activeZips.size,
      benchmarks_updated: insertedBenchmarks.length,
    },
    corsHeaders
  )
})
