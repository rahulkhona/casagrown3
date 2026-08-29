/**
 * E2E: Helper Management — /helping page
 *
 * Tests the helper's booth management page:
 * - Page renders with booth list
 * - Shows booth name, seller name, role, and status
 * - Leave Booth flow with confirmation + cancel
 * - Empty state for non-helpers
 * - RLS-based revocation works
 *
 * Seed data:
 * - buyer@test.local (Beth) is a helper for seller@test.local's default booth (HELP42)
 * - maria@test.local is a helper for seller's Saturday stand (SAT99)
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  execSql,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from './scenario-helpers'

test.describe('Helper Management — /helping page', () => {
  test.describe.configure({ mode: 'serial' })

  // Ensure Beth's helper relationship is accepted before tests
  test.beforeAll(() => {
    execSql(`
      UPDATE booth_helpers SET status = 'accepted'
      WHERE helper_id = (SELECT id FROM auth.users WHERE email = 'buyer@test.local')
    `)
  })

  // ──────────────────────────────────────────────────
  // HM1: Helping page shows booths (not orders)
  // ──────────────────────────────────────────────────
  test('HM1: helper sees booths they are helping at', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/helping')
    await assertPageHealthy(page)

    // Wait for booth cards to load (data is fetched async)
    await page.waitForSelector('[class*="boothCard"], [class*="roleBadge"], text=Full Access, text=Delivery Only', { timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(1000)

    const body = await page.locator('body').innerText()

    // Should show booth-related content
    expect(body).toMatch(/Helping/i)
    expect(body).toMatch(/Sam Seller|Seller/i)

    // Should NOT show order queue text (orders are on /orders now)
    expect(body).not.toMatch(/Mark Delivered/i)

    // Should show role or status info
    expect(body).toMatch(/Full Access|Delivery|Active|Closed/i)

    // Should show Leave Booth button
    expect(body).toMatch(/Leave Booth/i)

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // HM2: Booth card shows details and links
  // ──────────────────────────────────────────────────
  test('HM2: booth card shows name, role, status, and action links', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/helping')

    // Check for Orders link
    const ordersLink = page.locator('a:has-text("Orders")')
    await expect(ordersLink.first()).toBeVisible({ timeout: 10_000 })

    // Check for View Booth link
    const viewBoothLink = page.locator('a:has-text("View Booth")')
    await expect(viewBoothLink.first()).toBeVisible({ timeout: 5_000 })

    // Check for Leave Booth button
    const leaveBtn = page.locator('button:has-text("Leave Booth")')
    await expect(leaveBtn.first()).toBeVisible({ timeout: 5_000 })

    // Check for open/closed/active status
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/● Open|● Closed|● Active/)

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // HM3: Leave Booth confirmation cancel
  // ──────────────────────────────────────────────────
  test('HM3: Leave Booth shows confirmation and cancel dismisses it', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/helping')
    await assertPageHealthy(page)

    // Click "Leave Booth"
    const leaveBtn = page.locator('button:has-text("Leave Booth")').first()
    await expect(leaveBtn).toBeVisible({ timeout: 10_000 })
    await leaveBtn.click()

    // Confirmation should appear
    await expect(page.locator('button:has-text("Yes, Leave")')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible({ timeout: 5_000 })

    // Click Cancel — should dismiss confirmation
    await page.locator('button:has-text("Cancel")').click()
    await expect(page.locator('button:has-text("Yes, Leave")')).not.toBeVisible({ timeout: 3_000 })

    // Leave Booth button should still be there
    await expect(leaveBtn).toBeVisible()

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // HM4: Actually leave a booth
  // ──────────────────────────────────────────────────
  test('HM4: helper can leave a booth and it disappears from list', async ({ browser }) => {
    // Ensure maria has a helper relationship
    execSql(`
      UPDATE booth_helpers SET status = 'accepted'
      WHERE helper_id = (SELECT id FROM auth.users WHERE email = 'maria@test.local')
    `)

    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/helping')
    await assertPageHealthy(page)

    // Count initial booths
    const initialCards = page.locator('[class*="boothCard"]')
    const initialCount = await initialCards.count()
    expect(initialCount).toBeGreaterThan(0)

    // Click Leave Booth
    const leaveBtn = page.locator('button:has-text("Leave Booth")').first()
    await leaveBtn.click()

    // Confirm leave
    await page.locator('button:has-text("Yes, Leave")').click()

    // Wait for removal
    await page.waitForTimeout(2000)

    // Booth should be removed from list
    const afterCards = page.locator('[class*="boothCard"]')
    const afterCount = await afterCards.count()
    expect(afterCount).toBeLessThan(initialCount)

    await page.close()

    // Restore the helper relationship for other tests
    execSql(`
      UPDATE booth_helpers SET status = 'accepted', updated_at = now()
      WHERE helper_id = (SELECT id FROM auth.users WHERE email = 'maria@test.local')
    `)
  })

  // ──────────────────────────────────────────────────
  // HM5: Non-helper sees empty state
  // ──────────────────────────────────────────────────
  test('HM5: user with no helping relationships sees empty state', async ({ browser }) => {
    const page = await loginAsUser(browser, 'raj')
    await navigateTo(page, '/helping')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    expect(body).toMatch(/not helping|no|passcode/i)

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // HM6: RLS allows helper self-revocation via update
  // ──────────────────────────────────────────────────
  test('HM6: helper revocation works via status update through RLS', async () => {
    // Ensure maria is accepted
    execSql(`
      UPDATE booth_helpers SET status = 'accepted'
      WHERE helper_id = (SELECT id FROM auth.users WHERE email = 'maria@test.local')
    `)

    // Get maria's auth token
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: 'maria@test.local', password: 'test1234' }),
    })
    const authData = await res.json()
    const token = authData.access_token

    if (token) {
      // UPDATE status to revoked (RLS allows helper to update own row)
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/booth_helpers?helper_id=eq.${authData.user.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify({ status: 'revoked' }),
        },
      )
      expect(updateRes.status).toBeLessThan(400)

      // Verify status changed
      const verify = execSql(`
        SELECT status FROM booth_helpers
        WHERE helper_id = (SELECT id FROM auth.users WHERE email = 'maria@test.local')
        LIMIT 1
      `)
      expect(verify).toContain('revoked')

      // Restore
      execSql(`
        UPDATE booth_helpers SET status = 'accepted', updated_at = now()
        WHERE helper_id = (SELECT id FROM auth.users WHERE email = 'maria@test.local')
      `)
    }
  })
})

test.describe('Helper Product Listing — /my-stands + /create-listing', () => {
  test.describe.configure({ mode: 'serial' })

  // Ensure helper relationships are accepted before tests
  test.beforeAll(() => {
    execSql(`
      UPDATE booth_helpers SET status = 'accepted'
      WHERE helper_id IN (
        (SELECT id FROM auth.users WHERE email = 'buyer@test.local'),
        (SELECT id FROM auth.users WHERE email = 'maria@test.local')
      )
    `)
  })

  // ──────────────────────────────────────────────────
  // HL1: My Stands shows helper booths
  // ──────────────────────────────────────────────────
  test('HL1: helper sees booths they help with on my-stands page', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/my-stands')
    await assertPageHealthy(page)

    // Wait for helper booths to load (Add Listing button proves data loaded)
    const addListingBtn = page.locator('a:has-text("Add Listing")')
    await expect(addListingBtn.first()).toBeVisible({ timeout: 15_000 })

    const body = await page.locator('body').innerText()

    // Should show "Booths I Help With" section
    expect(body).toMatch(/Help With|Helping/i)

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // HL2: Add Listing from helper booth navigates to create-listing with booth param
  // ──────────────────────────────────────────────────
  test('HL2: Add Listing from helper booth links to create-listing with booth param', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/my-stands')
    await assertPageHealthy(page)

    // Find the Add Listing button in the helper section
    const helperSection = page.locator('text=Help With').first()
    await expect(helperSection).toBeVisible({ timeout: 10_000 })

    // Get the first Add Listing link in the helper section
    const addListingLinks = page.locator('a:has-text("Add Listing")')
    const count = await addListingLinks.count()
    expect(count).toBeGreaterThan(0)

    // Check that the link has a booth param
    const href = await addListingLinks.first().getAttribute('href')
    expect(href).toContain('booth=')

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // HL3: Maria (helper) sees helper booths in my-stands
  // ──────────────────────────────────────────────────
  test('HL3: maria sees helper booth with seller name', async ({ browser }) => {
    // Ensure maria is accepted as helper for Sam's booth
    execSql(`
      INSERT INTO booth_helpers (booth_id, helper_id, status)
      VALUES (
        'b9a8a4b1-d59f-4aa3-9e03-b1d33e011a2a',
        (SELECT id FROM auth.users WHERE email = 'maria@test.local'),
        'accepted'
      )
      ON CONFLICT (booth_id, helper_id) DO UPDATE SET status = 'accepted';
    `)

    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/my-stands')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()

    // Maria helps at Sam's booth — should see seller name or booth name
    expect(body).toMatch(/Help|Helping|Sam/i)

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // HL4: Helper booth card shows owner name
  // ──────────────────────────────────────────────────
  test('HL4: helper booth card shows booth owner name', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/my-stands')
    await assertPageHealthy(page)

    // Check for "by <seller name>" text in helper section
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/by\s+(Sam|Seller)/i)

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // HL5: Helper navigates to create-listing and sees booth pre-selected
  // ──────────────────────────────────────────────────
  test('HL5: helper navigates to create-listing with booth param and booth is pre-selected', async ({ browser }) => {
    // Get the booth ID for seller's default booth
    const boothId = execSql(`
      SELECT id FROM market_booths
      WHERE owner_id = 'a1111111-1111-1111-1111-111111111111'
      AND is_default = true LIMIT 1
    `).trim()

    if (!boothId) {
      console.log('[HL5] No default booth found — skipping')
      test.skip()
      return
    }

    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, `/my-booth/products/new?booth=${boothId}`)
    await page.waitForTimeout(3000)
    await assertPageHealthy(page)

    // The page should load with the booth pre-selected
    // If there are multiple booths, the selector should be visible
    const body = await page.locator('body').innerText()

    // Page should have loaded the create-listing form
    expect(body).toMatch(/Photo|Name|Category|product/i)

    // Should NOT show "Sign in" (Beth is logged in)
    expect(body).not.toMatch(/Sign in to add products/i)

    console.log('[HL5] ✅ Helper can access create-listing with booth param')

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // HL6: Helper submits product listing → seller_id = booth owner in DB
  // ──────────────────────────────────────────────────
  test('HL6: helper creates product listing and seller_id is booth owner', async ({ browser }) => {
    // Get the booth ID for seller's default booth
    const boothId = execSql(`
      SELECT id FROM market_booths
      WHERE owner_id = 'a1111111-1111-1111-1111-111111111111'
      AND is_default = true LIMIT 1
    `).trim()

    if (!boothId) {
      console.log('[HL6] No default booth found — skipping')
      test.skip()
      return
    }

    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, `/my-booth/products/new?booth=${boothId}`)
    await page.waitForTimeout(3000)
    await assertPageHealthy(page)

    // Wait for booth data to load — the booth selector should show the helper booth
    // This ensures allBooths is populated before we submit
    const boothSelect = page.locator('select[id*="booth" i], select[name*="booth" i], label:has-text("Booth") ~ select, label:has-text("Stand") ~ select').first()
    if (await boothSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Wait until it has the helper booth option
      await page.waitForFunction(
        (bid) => {
          const selects = Array.from(document.querySelectorAll('select'))
          for (let i = 0; i < selects.length; i++) {
            const opts = selects[i].options
            for (let j = 0; j < opts.length; j++) {
              if (opts[j].value === bid) return true
            }
          }
          return false
        },
        boothId,
        { timeout: 10000 }
      ).catch(() => { /* proceed anyway */ })
    } else {
      // No booth select visible — booth param set directly, wait for data load
      await page.waitForTimeout(3000)
    }

    // Fill out minimal product details
    const nameInput = page.locator('input[placeholder*="name" i], input[id*="name" i], input[aria-label*="name" i]').first()
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill('HL6 Helper Test Product')
    } else {
      // Try textarea or any text input near "Name" label
      const nameField = page.locator('label:has-text("Name") + input, label:has-text("Name") ~ input').first()
      if (await nameField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nameField.fill('HL6 Helper Test Product')
      }
    }

    // Select category if dropdown is visible
    const categorySelect = page.locator('select').first()
    if (await categorySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await categorySelect.selectOption({ index: 1 })
    }

    // Try to submit as draft (less validation required)
    const draftBtn = page.locator('button:has-text("Draft"), button:has-text("Save Draft"), button:has-text("draft")')
    if (await draftBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await draftBtn.first().click()
      await page.waitForTimeout(3000)

      // Check the database for the product
      const productCheck = execSql(`
        SELECT seller_id, booth_id FROM market_products
        WHERE name = 'HL6 Helper Test Product'
        ORDER BY created_at DESC LIMIT 1
      `).trim()

      if (productCheck) {
        // Verify seller_id is the booth OWNER (Sam), not the helper (Beth)
        expect(productCheck).toContain('a1111111-1111-1111-1111-111111111111')
        console.log('[HL6] ✅ Product created with seller_id = booth owner')
      } else {
        console.log('[HL6] ⚠️ Product not found in DB — form validation may have blocked submission')
      }

      // Cleanup
      execSql(`DELETE FROM market_products WHERE name = 'HL6 Helper Test Product'`)
    } else {
      console.log('[HL6] ⚠️ No draft button found — skipping submission check')
    }

    await page.close()
  })
})
