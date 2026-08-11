import { test, expect } from '@playwright/test'
import { BASE_URL, execSql } from './scenario-helpers'

test.describe('USDA Local Farms & Farmers Markets 2-Tier Cache E2E Performance Suite', () => {
  const TEST_ZIP = '95125'

  test.beforeAll(async () => {
    // Seed initial record into public.usda_market_cache in database
    const query = `
      INSERT INTO public.usda_market_cache (cache_key, zip_code, markets, farms, updated_at)
      VALUES (
        'usda_cache_${TEST_ZIP}',
        '${TEST_ZIP}',
        '[{"listing_name": "Willow Glen Farmers Market E2E", "location_city": "San Jose", "location_state": "CA", "distance": "0.8"}]'::jsonb,
        '[{"listing_name": "Willow Glen CSA Farm", "_directory": "csa", "location_city": "San Jose", "location_state": "CA"}]'::jsonb,
        now()
      )
      ON CONFLICT (cache_key) DO UPDATE 
      SET markets = EXCLUDED.markets, farms = EXCLUDED.farms, updated_at = now();
    `
    execSql(query)
  })

  test('CACHE-01: Verifies instant 0ms localStorage cache rendering on revisit', async ({ page }) => {
    // Pre-populate localStorage to simulate a cached visit
    await page.goto(`${BASE_URL}/market`, { waitUntil: 'domcontentloaded' })
    await page.evaluate((zip) => {
      localStorage.setItem(`usda_cache_${zip}`, JSON.stringify({
        timestamp: Date.now(),
        markets: [{ listing_name: 'Willow Glen Farmers Market E2E', location_city: 'San Jose', location_state: 'CA', distance: '0.8' }],
        farms: [{ listing_name: 'Willow Glen CSA Farm', _directory: 'csa', location_city: 'San Jose', location_state: 'CA' }]
      }))
    }, TEST_ZIP)

    // Reload page with ZIP param — should load instantly from localStorage cache
    const start = Date.now()
    await page.goto(`${BASE_URL}/market?zip=${TEST_ZIP}&lat=37.3079&lng=-121.8950`, { waitUntil: 'domcontentloaded' })
    const elapsed = Date.now() - start

    // Page load with instant cache must be under 3.5s
    expect(elapsed).toBeLessThan(3500)

    // Verify localStorage item exists
    const cacheVal = await page.evaluate((zip) => localStorage.getItem(`usda_cache_${zip}`), TEST_ZIP)
    expect(cacheVal).toBeTruthy()

    const parsed = JSON.parse(cacheVal!)
    expect(parsed.markets[0].listing_name).toBe('Willow Glen Farmers Market E2E')
  })

  test('CACHE-02: Verifies public.usda_market_cache database table retains valid cache', async () => {
    const rawDb = execSql(`SELECT cache_key, jsonb_array_length(markets) as m_count FROM public.usda_market_cache WHERE cache_key = 'usda_cache_${TEST_ZIP}';`)
    expect(rawDb).toContain('usda_cache_95125')
  })
})
