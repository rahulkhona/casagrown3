import { test, expect } from '@playwright/test'
import { loginAsUser, navigateToMarket, execSql, SUPABASE_URL, SUPABASE_ANON_KEY, getAccessToken, TEST_USERS } from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Zone Pulse Polling E2E', () => {
  test('market page uses check_zone_pulse instead of refresh_product_data + nearby_booths for polling', async ({ browser }) => {
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
    const initialCalls = [...rpcCalls]
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

  test('idle market page does not trigger nearby_booths after initial load', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')

    const nearbyBoothsCalls: number[] = []
    page.on('request', (req) => {
      if (req.url().includes('/rpc/nearby_booths')) {
        nearbyBoothsCalls.push(Date.now())
      }
    })

    await navigateToMarket(page)
    await page.waitForTimeout(3000) // let initial load finish

    const callsAfterLoad = nearbyBoothsCalls.length
    // Wait 65s — more than one old heavy poll interval (120s) but enough for 2 pulse checks
    await page.waitForTimeout(65_000)

    // No additional nearby_booths calls should have been made (only pulse checks)
    expect(nearbyBoothsCalls.length).toBe(callsAfterLoad)

    await page.context().close()
  })

  test('zone pulse detects data change and triggers refresh', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')

    const nearbyBoothsCalls: number[] = []
    page.on('request', (req) => {
      if (req.url().includes('/rpc/nearby_booths')) {
        nearbyBoothsCalls.push(Date.now())
      }
    })

    await navigateToMarket(page)
    await page.waitForTimeout(3000)

    const callsAfterLoad = nearbyBoothsCalls.length

    // Simulate a seller updating a product (this updates zone_pulse via trigger)
    execSql(
      `UPDATE market_products SET price_usd = price_usd + 0.01
       WHERE seller_id = (SELECT id FROM auth.users WHERE email = 'seller@test.local')
       AND is_active = true LIMIT 1`
    )

    // Wait for the next pulse check to detect the change and trigger a refresh
    // Pulse interval is 30s, so wait up to 35s
    await page.waitForTimeout(35_000)

    // A nearby_booths call should have been triggered by the pulse detecting the change
    expect(nearbyBoothsCalls.length).toBeGreaterThan(callsAfterLoad)

    await page.context().close()
  })
})
