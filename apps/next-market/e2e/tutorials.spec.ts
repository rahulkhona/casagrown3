import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

test.describe('Video Tutorials Menu & Visibility', () => {
  let supabase: any;

  test.beforeAll(() => {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  })

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
    // Delete any test tutorials to start clean
    await supabase.from('tutorial_sections').delete().like('title', 'PW_MKT_%')
  })

  test.afterEach(async () => {
    // Clean up
    await supabase.from('tutorial_sections').delete().like('title', 'PW_MKT_%')
  })

  test('navbar hamburger menu and user guide hide/show Video Tutorials link conditionally', async ({ page }) => {
    // ─── PART 1: HIDE WHEN NO TUTORIALS EXIST ───
    // Temporarily unpublish any pre-existing tutorials
    const { data: originalPublished } = await supabase
      .from('tutorial_sections')
      .select('*')
      .eq('is_published', true)

    if (originalPublished && originalPublished.length > 0) {
      await supabase
        .from('tutorial_sections')
        .update({ is_published: false })
        .in('id', originalPublished.map((t: any) => t.id))
    }

    // Load home page in guest mode (unauthenticated) to check the footer
    const guestContext = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } })
    const guestPage = await guestContext.newPage()
    await guestPage.goto('/')
    await guestPage.waitForTimeout(2000)

    // Verify footer link is NOT visible on the guest landing page
    await expect(guestPage.locator('footer >> text=Video Tutorials')).not.toBeVisible()
    await guestPage.close()
    await guestContext.close()

    // Load market page for authenticated user
    await page.goto('/market')
    await page.waitForTimeout(2000)

    // Open hamburger menu (set viewport size to force mobile view menu toggle)
    await page.setViewportSize({ width: 390, height: 844 })
    const menuButton = page.locator('button[class*="hamburger"]').first()
    if (await menuButton.isVisible()) {
      await menuButton.click()
      await page.waitForTimeout(500)
      await expect(page.locator('text=Video Tutorials')).not.toBeVisible()
      // Close menu
      await menuButton.click()
    } else {
      // Desktop view (fallback check)
      await expect(page.locator('text=Video Tutorials')).not.toBeVisible()
    }

    // Navigate to User Guide page
    await page.goto('/guide')
    await page.waitForTimeout(1000)
    await expect(page.locator('text=Prefer watching over reading?')).not.toBeVisible()

    // ─── PART 2: SHOW WHEN TUTORIALS EXIST ───
    // Insert a published test tutorial
    const testTitle = 'PW_MKT_Test Tutorial'
    const { error: insertError } = await supabase
      .from('tutorial_sections')
      .insert({
        title: testTitle,
        description: '<p>Learn how to use CasaGrown via this interactive video tutorial.</p>',
        video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        is_published: true,
        sort_order: 100
      })
    expect(insertError).toBeNull()

    // Reload homepage in guest mode (unauthenticated) to check the footer
    const guestContext2 = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } })
    const guestPage2 = await guestContext2.newPage()
    await guestPage2.goto('/')
    await guestPage2.waitForTimeout(2000)

    // Verify footer link is now visible
    const footerLink = guestPage2.locator('footer >> text=Video Tutorials').first()
    await expect(footerLink).toBeVisible()
    await guestPage2.close()
    await guestContext2.close()

    // Check navbar hamburger menu link on authenticated page
    await page.goto('/market')
    await page.waitForTimeout(2000)
    if (await menuButton.isVisible()) {
      await menuButton.click()
      await page.waitForTimeout(500)
      await expect(page.locator('text=Video Tutorials').first()).toBeVisible()
      // Click the menu link
      await page.locator('text=Video Tutorials').first().click()
    } else {
      const navLink = page.locator('text=Video Tutorials').first()
      await expect(navLink).toBeVisible()
      await navLink.click()
    }

    // We should be redirected to the /tutorials page
    await page.waitForURL('**/tutorials', { timeout: 10000 })
    await expect(page.locator(`text=${testTitle}`)).toBeVisible()
    await expect(page.locator(`iframe[title="${testTitle}"]`)).toBeVisible()

    // Navigate to User Guide page
    await page.goto('/guide')
    await page.waitForTimeout(1000)
    // Verify the video tutorials banner/card appears
    await expect(page.locator('text=Prefer watching over reading?').first()).toBeVisible()

    // Restore original published tutorials
    if (originalPublished && originalPublished.length > 0) {
      await supabase
        .from('tutorial_sections')
        .update({ is_published: true })
        .in('id', originalPublished.map((t: any) => t.id))
    }
  })
})
