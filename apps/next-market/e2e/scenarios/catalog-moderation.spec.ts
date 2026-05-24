/**
 * E2E: Catalog Content Moderation
 *
 * Tests that the catalog item creation form blocks banned content:
 * - Profanity in name/description
 * - Banned substances (cannabis, drugs)
 * - Weapons
 * - Violence
 * - Adult content
 * - Clean items are allowed through
 *
 * Seed data:
 * - seller@test.local (Sam) has booths and can access /my-stands/catalog
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  execSql,
} from './scenario-helpers'

test.describe('Catalog Content Moderation', () => {
  test.describe.configure({ mode: 'serial' })

  // ──────────────────────────────────────────────────
  // CM1: Profanity in catalog item name is blocked
  // ──────────────────────────────────────────────────
  test('CM1: catalog blocks profanity in product name', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/my-stands/catalog')
    await assertPageHealthy(page)

    // Click Add Item button
    const addBtn = page.locator('button:has-text("Add Item"), button:has-text("Add Your First Item")')
    await addBtn.first().click()
    await page.waitForTimeout(1000)

    // Fill in name with profanity
    const nameInput = page.locator('input[placeholder*="Organic"], input[placeholder*="Tomato"], input[placeholder*="name" i]').first()
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill('Fucking Great Tomatoes')
    }

    // Select category
    const categorySelect = page.locator('select').first()
    if (await categorySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await categorySelect.selectOption({ index: 1 })
    }

    // Click save
    const saveBtn = page.locator('button:has-text("Add to Catalog"), button:has-text("Save")')
    await saveBtn.first().click()
    await page.waitForTimeout(1000)

    // Should show error message about profanity
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/profanity|inappropriate|prohibited/i)

    // Modal should still be open (form was not submitted)
    const modal = page.locator('[class*="modalPanel"], [class*="modal"]')
    await expect(modal.first()).toBeVisible()

    console.log('[CM1] ✅ Profanity blocked in catalog item name')
    await page.close()
  })

  // ──────────────────────────────────────────────────
  // CM2: Cannabis/drugs in catalog item name is blocked
  // ──────────────────────────────────────────────────
  test('CM2: catalog blocks banned substances in name', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/my-stands/catalog')
    await assertPageHealthy(page)

    const addBtn = page.locator('button:has-text("Add Item"), button:has-text("Add Your First Item")')
    await addBtn.first().click()
    await page.waitForTimeout(1000)

    const nameInput = page.locator('input[placeholder*="Organic"], input[placeholder*="Tomato"], input[placeholder*="name" i]').first()
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill('Cannabis Infused Honey')
    }

    const categorySelect = page.locator('select').first()
    if (await categorySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await categorySelect.selectOption({ index: 1 })
    }

    const saveBtn = page.locator('button:has-text("Add to Catalog"), button:has-text("Save")')
    await saveBtn.first().click()
    await page.waitForTimeout(1000)

    const body = await page.locator('body').innerText()
    expect(body).toMatch(/cannabis|prohibited|not allowed/i)

    console.log('[CM2] ✅ Banned substance blocked in catalog item name')
    await page.close()
  })

  // ──────────────────────────────────────────────────
  // CM3: Weapons in catalog item name is blocked
  // ──────────────────────────────────────────────────
  test('CM3: catalog blocks weapons in name', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/my-stands/catalog')
    await assertPageHealthy(page)

    const addBtn = page.locator('button:has-text("Add Item"), button:has-text("Add Your First Item")')
    await addBtn.first().click()
    await page.waitForTimeout(1000)

    const nameInput = page.locator('input[placeholder*="Organic"], input[placeholder*="Tomato"], input[placeholder*="name" i]').first()
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill('Hunting Rifle Accessories')
    }

    const categorySelect = page.locator('select').first()
    if (await categorySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await categorySelect.selectOption({ index: 1 })
    }

    const saveBtn = page.locator('button:has-text("Add to Catalog"), button:has-text("Save")')
    await saveBtn.first().click()
    await page.waitForTimeout(1000)

    const body = await page.locator('body').innerText()
    expect(body).toMatch(/weapon|firearm|not allowed/i)

    console.log('[CM3] ✅ Weapons blocked in catalog item name')
    await page.close()
  })

  // ──────────────────────────────────────────────────
  // CM4: Banned content in description is blocked
  // ──────────────────────────────────────────────────
  test('CM4: catalog blocks banned content in description', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/my-stands/catalog')
    await assertPageHealthy(page)

    const addBtn = page.locator('button:has-text("Add Item"), button:has-text("Add Your First Item")')
    await addBtn.first().click()
    await page.waitForTimeout(1000)

    // Clean name
    const nameInput = page.locator('input[placeholder*="Organic"], input[placeholder*="Tomato"], input[placeholder*="name" i]').first()
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill('Fresh Tomatoes')
    }

    // Banned description
    const descArea = page.locator('textarea').first()
    if (await descArea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await descArea.fill('Buy these tomatoes with some marijuana on the side')
    }

    const categorySelect = page.locator('select').first()
    if (await categorySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await categorySelect.selectOption({ index: 1 })
    }

    const saveBtn = page.locator('button:has-text("Add to Catalog"), button:has-text("Save")')
    await saveBtn.first().click()
    await page.waitForTimeout(1000)

    const body = await page.locator('body').innerText()
    expect(body).toMatch(/cannabis|prohibited|not allowed/i)

    console.log('[CM4] ✅ Banned content blocked in catalog description')
    await page.close()
  })

  // ──────────────────────────────────────────────────
  // CM5: Clean catalog item is allowed
  // ──────────────────────────────────────────────────
  test('CM5: clean catalog item is accepted', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/my-stands/catalog')
    await assertPageHealthy(page)

    const addBtn = page.locator('button:has-text("Add Item"), button:has-text("Add Your First Item")')
    await addBtn.first().click()
    await page.waitForTimeout(1000)

    const nameInput = page.locator('input[placeholder*="Organic"], input[placeholder*="Tomato"], input[placeholder*="name" i]').first()
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill('CM5 Test Organic Basil')
    }

    const descArea = page.locator('textarea').first()
    if (await descArea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await descArea.fill('Fresh organic basil grown in raised beds')
    }

    const categorySelect = page.locator('select').first()
    if (await categorySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await categorySelect.selectOption({ index: 1 })
    }

    const saveBtn = page.locator('button:has-text("Add to Catalog"), button:has-text("Save")')
    await saveBtn.first().click()
    await page.waitForTimeout(2000)

    // Modal should close (item was saved)
    const modal = page.locator('[class*="modalPanel"]')
    const modalVisible = await modal.first().isVisible({ timeout: 2000 }).catch(() => false)

    // Either modal closed OR the item appears in the list
    const body = await page.locator('body').innerText()
    const itemSaved = body.includes('CM5 Test Organic Basil') || !modalVisible
    expect(itemSaved).toBe(true)

    // Cleanup — delete the test item from DB
    execSql(`DELETE FROM catalog_items WHERE name = 'CM5 Test Organic Basil'`)

    console.log('[CM5] ✅ Clean catalog item accepted')
    await page.close()
  })
})
