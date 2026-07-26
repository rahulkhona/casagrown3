/**
 * Quarantine System — Buyer-Side Enforcement
 *
 * Tests:
 * QB1  PDP shows soft warning quarantine banner when product is quarantined
 * QB2  Buy Now button is enabled on quarantined PDP (soft warning mode)
 * QB5  Non-produce product does NOT show quarantine banner
 * QB6  Quarantines info page shows county quarantine
 * QB7  Quarantines info page does NOT show state-level quarantines
 *
 * Strategy:
 * - Looks up existing CA state, adds county + zip mapping if missing
 * - Seeds quarantine zone for that county
 * - Beth (buyer) visits Maria's quarantined produce PDP
 * - After tests, clean up seeded quarantine data
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  execSql,
  TEST_USERS,
} from './scenario-helpers'

// Deterministic UUIDs for test-created rows (only county + quarantine zones)
let countyId = ''
const QUAR_UUID    = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee03'
const STATE_Q_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee04'

let stateId = ''
let cityId = ''

test.describe('Quarantine — Buyer-Side Enforcement', () => {
  test.beforeAll(async () => {
    // Look up existing CA state and San Jose city (created by seed.sql)
    stateId = execSql(`SELECT id FROM states WHERE code = 'CA' LIMIT 1`).trim()
    cityId = execSql(`SELECT id FROM cities WHERE name = 'San Jose' LIMIT 1`).trim()

    if (!stateId) {
      console.error('[SETUP] No CA state found — skipping quarantine tests')
      return
    }

    // Create Santa Clara county (only thing not in seed)
    countyId = execSql(`SELECT id FROM counties WHERE name = 'Santa Clara' AND state_id = '${stateId}' LIMIT 1`).trim()
    if (!countyId) {
      countyId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee01'
      execSql(`INSERT INTO counties (id, fips_code, name, state_id)
               VALUES ('${countyId}', '06085', 'Santa Clara', '${stateId}')
               ON CONFLICT (id) DO NOTHING`)
    }

    // Link Maria's zip (95120) to Santa Clara county
    execSql(`UPDATE zip_codes SET county_id = '${countyId}'
             WHERE zip_code = '95120'`)
    execSql(`INSERT INTO zip_codes (zip_code, country_iso_3, city_id, county_id)
             SELECT '95120', 'USA', '${cityId}', '${countyId}'
             WHERE NOT EXISTS (SELECT 1 FROM zip_codes WHERE zip_code = '95120')
             ON CONFLICT (zip_code, country_iso_3) DO NOTHING`)

    // Ensure idempotent inserts by clearing any existing zones from aborted runs
    execSql(`DELETE FROM quarantine_zones WHERE pest_name IN ('E2E Test Fruit Fly', 'E2E State Level Pest')`)

    // County-level quarantine
    execSql(`INSERT INTO quarantine_zones (id, country_iso_3, state_id, county_id, category, pest_name, starts_at, is_active, keywords)
             VALUES ('${QUAR_UUID}', 'USA', '${stateId}', '${countyId}',
                     'produce', 'E2E Test Fruit Fly', CURRENT_DATE, true,
                     '{apples,oranges,mangoes,tomatoes,peppers,plums}')
             ON CONFLICT (category, pest_name, COALESCE(country_iso_3, ''), COALESCE(state_id, '00000000-0000-0000-0000-000000000000'), COALESCE(county_id, '00000000-0000-0000-0000-000000000000'), COALESCE(city_id, '00000000-0000-0000-0000-000000000000')) 
             DO UPDATE SET is_active = true, ends_at = NULL`)

    // State-level quarantine (should NOT appear — county-only enforcement)
    execSql(`INSERT INTO quarantine_zones (id, country_iso_3, state_id, county_id, category, pest_name, starts_at, is_active)
             VALUES ('${STATE_Q_UUID}', 'USA', '${stateId}', NULL,
                     'produce', 'E2E State Level Pest', CURRENT_DATE, true)
             ON CONFLICT (id) DO UPDATE SET is_active = true`)
  })

  test.afterAll(async () => {
    // Rely on beforeAll cleanup to avoid race conditions with parallel workers
    // execSql(`DELETE FROM quarantine_zones WHERE id IN ('${QUAR_UUID}', '${STATE_Q_UUID}')`)
  })

  test('QB1 — PDP shows quarantine banner for produce product', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')

    const mariaId = execSql(
      `SELECT id FROM auth.users WHERE email = '${TEST_USERS.maria.email}'`
    ).trim()

    const productRow = execSql(
      `SELECT p.id, b.id FROM market_products p
       JOIN market_booths b ON b.owner_id = p.seller_id
       WHERE p.seller_id = '${mariaId}' AND p.category = 'produce' AND p.is_active = true
       LIMIT 1`
    ).trim()

    if (!productRow) { test.skip(); await page.context().close(); return }

    const [productId, boothId] = productRow.split('|').map(s => s.trim())
    await navigateTo(page, `/market/booth/${boothId}/product/${productId}`)
    await page.waitForTimeout(3000)

    const banner = page.getByText(/agricultural quarantine/i)
    expect(await banner.isVisible({ timeout: 10000 }).catch(() => false)).toBe(true)

    const pestText = page.getByText('E2E Test Fruit Fly')
    expect(await pestText.isVisible({ timeout: 3000 }).catch(() => false)).toBe(true)

    await page.context().close()
  })

  test('QB2 — Buy Now button is ENABLED on quarantined PDP (soft warning)', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')

    const mariaId = execSql(
      `SELECT id FROM auth.users WHERE email = '${TEST_USERS.maria.email}'`
    ).trim()

    const productRow = execSql(
      `SELECT p.id, b.id FROM market_products p
       JOIN market_booths b ON b.owner_id = p.seller_id
       WHERE p.seller_id = '${mariaId}' AND p.category = 'produce' AND p.is_active = true
       LIMIT 1`
    ).trim()

    if (!productRow) { test.skip(); await page.context().close(); return }

    const [productId, boothId] = productRow.split('|').map(s => s.trim())
    await navigateTo(page, `/market/booth/${boothId}/product/${productId}`)
    await page.waitForTimeout(3000)

    // Button should say "Buy Now" and NOT be disabled (unless it's out of stock)
    const buyNowBtn = page.locator('button:has-text("Buy Now")')
    if (await buyNowBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(buyNowBtn).toBeEnabled()
    }

    // Add to Cart SHOULD be visible despite quarantine
    const addToCartBtn = page.locator('button:has-text("Add to Cart")')
    expect(await addToCartBtn.isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)

    await page.context().close()
  })

  test('QB5 — Non-produce product does NOT show quarantine banner', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')

    const nonProduceRow = execSql(
      `SELECT p.id, b.id FROM market_products p
       JOIN market_booths b ON b.owner_id = p.seller_id
       WHERE p.category != 'produce' AND p.is_active = true
       LIMIT 1`
    ).trim()

    if (!nonProduceRow) { test.skip(); await page.context().close(); return }

    const [productId, boothId] = nonProduceRow.split('|').map(s => s.trim())
    await navigateTo(page, `/market/booth/${boothId}/product/${productId}`)
    await page.waitForTimeout(3000)

    const banner = page.getByText('Potential Agricultural Quarantine')
    expect(await banner.isVisible({ timeout: 3000 }).catch(() => false)).toBe(false)

    await page.context().close()
  })

  test('QB6 — Quarantines info page shows county quarantine', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/quarantines')
    await assertPageHealthy(page)

    const pestName = page.getByText('E2E Test Fruit Fly')
    expect(await pestName.isVisible({ timeout: 10000 }).catch(() => false)).toBe(true)

    await page.context().close()
  })

  test('QB7 — State-level quarantine NOT shown on quarantines page', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/quarantines')
    await page.waitForTimeout(3000)

    const statePest = page.getByText('E2E State Level Pest')
    expect(await statePest.isVisible({ timeout: 3000 }).catch(() => false)).toBe(false)

    await page.context().close()
  })
})
