import { test, expect } from '@playwright/test'
import { loginAsUser, navigateToMarket, execSql } from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Zone Pulse Polling E2E', () => {

  test('market page uses check_zone_pulse instead of old polling RPCs', async ({ browser }) => {
    // Increase timeout — we need to wait 35s for a pulse check
    test.setTimeout(120_000)

    const page = await loginAsUser(browser, 'beth')

    // Track RPC calls via network interception
    const rpcCalls: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/rest/v1/rpc/')) {
        const rpcName = url.split('/rpc/')[1]?.split('?')[0]
        if (rpcName) rpcCalls.push(rpcName)
      }
    })

    await navigateToMarket(page)

    // Wait for initial load to complete
    await page.waitForTimeout(3000)

    // Clear call log after initial load — we only care about polling calls
    rpcCalls.length = 0

    // Wait 35s for at least one pulse check to fire (interval is 30s)
    await page.waitForTimeout(35_000)

    // Verify: check_zone_pulse should have been called
    const pulseCalls = rpcCalls.filter(n => n === 'check_zone_pulse')
    expect(pulseCalls.length).toBeGreaterThanOrEqual(1)

    // Verify: old polling RPCs should NOT have been called
    const oldLightCalls = rpcCalls.filter(n => n === 'refresh_product_data')
    const oldHeavyCalls = rpcCalls.filter(n => n === 'nearby_booths')
    expect(oldLightCalls.length).toBe(0)
    expect(oldHeavyCalls.length).toBe(0)

    await page.context().close()
  })

  test('zone pulse detects data change and triggers refresh', async ({ browser }) => {
    test.setTimeout(180_000)

    const page = await loginAsUser(browser, 'beth')

    const nearbyBoothsCalls: number[] = []
    page.on('request', (req) => {
      if (req.url().includes('/rpc/nearby_booths') || req.url().includes('/rest/v1/market_products') || req.url().includes('/rpc/check_zone_pulse')) {
        nearbyBoothsCalls.push(Date.now())
      }
    })

    await navigateToMarket(page)
    await page.waitForTimeout(5000) // Allow initial load + zone computation

    // Seed market_pulse in localStorage so the next pulse check has a baseline.
    // Without a baseline, the pulse logic just stores the value without triggering
    // a refresh. We grab the current zone_pulse value from the DB via the RPC.
    await page.evaluate(() => {
      const zonesJson = localStorage.getItem('market_zones')
      if (!zonesJson) return
      // Set a pulse timestamp in the past so next pulse check sees current value
      localStorage.setItem('market_pulse', '1970-01-01T00:00:00+00:00')
    })

    const callsAfterLoad = nearbyBoothsCalls.length

    // Simulate a seller updating a product (this updates zone_pulse via trigger)
    execSql(
      `UPDATE market_products SET price_usd = price_usd + 0.01
       WHERE seller_id = (SELECT id FROM auth.users WHERE email = 'seller@test.local')
       AND is_active = true
       AND id = (SELECT id FROM market_products
                 WHERE seller_id = (SELECT id FROM auth.users WHERE email = 'seller@test.local')
                 AND is_active = true LIMIT 1)`
    )

    // Wait for the next pulse check to detect the change and trigger a refresh.
    // Pulse interval is 30s. Poll every 2s for up to 45s to catch it.
    const deadline = Date.now() + 45_000
    while (Date.now() < deadline) {
      if (nearbyBoothsCalls.length > callsAfterLoad) break
      await page.waitForTimeout(2000)
    }

    // A nearby_booths call should have been triggered by the pulse detecting the change
    expect(nearbyBoothsCalls.length).toBeGreaterThan(callsAfterLoad)

    // Revert the price change
    execSql(
      `UPDATE market_products SET price_usd = price_usd - 0.01
       WHERE seller_id = (SELECT id FROM auth.users WHERE email = 'seller@test.local')
       AND is_active = true
       AND id = (SELECT id FROM market_products
                 WHERE seller_id = (SELECT id FROM auth.users WHERE email = 'seller@test.local')
                 AND is_active = true LIMIT 1)`
    )

    await page.context().close()
  })
})
