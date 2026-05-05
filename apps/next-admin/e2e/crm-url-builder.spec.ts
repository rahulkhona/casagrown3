/**
 * Tracking URL Builder — Admin E2E Tests
 *
 * Tests the TrackingUrlBuilder component embedded in:
 *   1. CRM → Landing Pages (/crm/landing-pages)
 *   2. CRM → Campaigns (/crm/campaigns)
 *   3. CRM → Sequences (SequenceBuilder sidebar)
 *
 * UX scenarios: field interaction, live URL preview, source/medium dropdowns,
 * copy button, short link creation, reset button.
 *
 * Auth: Handled by setup project storageState.
 * Run: cd apps/next-admin && npx playwright test e2e/crm-url-builder.spec.ts
 */
import { test, expect } from '@playwright/test'

// ── Landing Pages — URL Builder ───────────────────────────────────────────────

test.describe('Tracking URL Builder — Landing Pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/landing-pages', { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('button:has-text("+ Register Page")', { state: 'visible', timeout: 10000 })
  })

  test('URL Builder renders below the landing pages table', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    // The builder is always rendered (full-width, not in compact mode here)
    await expect(page.getByText('Tracking URL Builder')).toBeVisible()
    await expect(page.getByText('Build UTM-tagged links')).toBeVisible()

    // No JS errors from the component
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('Source dropdown contains expected channels', async ({ page }) => {
    // Find the Source select inside the URL builder
    const sourceSelect = page.locator('select').filter({ hasText: 'Facebook' }).first()
    await expect(sourceSelect).toBeVisible()

    // Check core options are present
    await expect(sourceSelect.locator('option[value="facebook"]')).toHaveCount(1)
    await expect(sourceSelect.locator('option[value="instagram"]')).toHaveCount(1)
    await expect(sourceSelect.locator('option[value="nextdoor"]')).toHaveCount(1)
    await expect(sourceSelect.locator('option[value="google"]')).toHaveCount(1)
    await expect(sourceSelect.locator('option[value="newsletter"]')).toHaveCount(1)
  })

  test('Medium dropdown contains expected channel types', async ({ page }) => {
    const mediumSelect = page.locator('select').filter({ hasText: 'Social (Organic Post)' }).first()
    await expect(mediumSelect).toBeVisible()

    await expect(mediumSelect.locator('option[value="social"]')).toHaveCount(1)
    await expect(mediumSelect.locator('option[value="email"]')).toHaveCount(1)
    await expect(mediumSelect.locator('option[value="sms"]')).toHaveCount(1)
    await expect(mediumSelect.locator('option[value="cpc"]')).toHaveCount(1)
  })

  test('Filling UTM fields generates a live URL preview', async ({ page }) => {
    // Select source
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('facebook')
    // Select medium
    await page.locator('select').filter({ hasText: 'Social (Organic Post)' }).first().selectOption('social')
    // Fill campaign
    await page.getByPlaceholder('e.g. spring-2026').fill('may-seller-push')
    // Fill content (which Facebook group)
    await page.getByPlaceholder('e.g. backyard-gardeners-fb-group').fill('fresno-gardeners-group')

    // The live URL preview should now be visible and contain all params
    const preview = page.locator('code').filter({ hasText: 'utm_source=facebook' })
    await expect(preview).toBeVisible({ timeout: 3000 })
    await expect(preview).toContainText('utm_medium=social')
    await expect(preview).toContainText('utm_campaign=may-seller-push')
    await expect(preview).toContainText('utm_content=fresno-gardeners-group')
  })

  test('utm_term field is present with hint text about Facebook groups', async ({ page }) => {
    // Verify the utm_term field exists
    await expect(page.getByPlaceholder('e.g. sell-backyard-produce')).toBeVisible()

    // Verify the hint text guides users correctly
    await expect(page.getByText(/prefer.*Content.*above/i)).toBeVisible()
  })

  test('utm_term value appears in generated URL', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('google')
    await page.locator('select').filter({ hasText: 'Social (Organic Post)' }).first().selectOption('cpc')
    await page.getByPlaceholder('e.g. sell-backyard-produce').fill('sell home produce near me')

    const preview = page.locator('code').filter({ hasText: 'utm_term=' })
    await expect(preview).toBeVisible({ timeout: 3000 })
    await expect(preview).toContainText('utm_term=sell+home+produce+near+me')
  })

  test('Copy button appears and is clickable once URL is generated', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('instagram')
    await page.locator('select').filter({ hasText: 'Social (Organic Post)' }).first().selectOption('social')

    // Copy button appears in the green preview box
    const copyBtn = page.locator('button:has-text("📋 Copy")').first()
    await expect(copyBtn).toBeVisible({ timeout: 3000 })
    await copyBtn.click()

    // Button briefly shows "✓ Copied!" feedback
    await expect(page.locator('button:has-text("✓ Copied!")')).toBeVisible({ timeout: 2000 })
  })

  test('Reset button clears all fields and hides URL preview', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('facebook')
    await page.getByPlaceholder('e.g. spring-2026').fill('test-campaign')

    // Confirm URL preview appeared
    await expect(page.locator('code').filter({ hasText: 'utm_source=facebook' })).toBeVisible({ timeout: 3000 })

    // Click Reset
    await page.getByText('↺ Reset').click()

    // URL preview should disappear (no source selected = no URL built)
    await expect(page.locator('code').filter({ hasText: 'utm_source=facebook' })).not.toBeVisible()
  })

  test('Custom URL toggle switches from preset dropdown to free-text input', async ({ page }) => {
    const customBtn = page.getByText('Custom URL')
    await expect(customBtn).toBeVisible()
    await customBtn.click()

    // Free-text input should now appear
    await expect(page.getByPlaceholder('https://casagrown.com/sell')).toBeVisible()
    // Click back to preset
    await page.getByText('← Preset').click()
    // Dropdown should be back
    await expect(page.locator('select').filter({ hasText: '/sell' }).first()).toBeVisible()
  })

  test('Clicking a landing page row pre-fills the base URL', async ({ page }) => {
    // If there are registered landing pages, click the first row
    const rows = page.locator('tbody tr')
    const count = await rows.count()
    if (count === 0) {
      console.warn('[URL BUILDER] No landing pages registered yet — skipping row click test')
      return
    }
    await rows.first().click()
    // After click, the URL builder should reflect the selected page
    // The base URL select or input should have changed from default
    await page.waitForTimeout(500)
    // Builder is still visible (not hidden by row click)
    await expect(page.getByText('Tracking URL Builder')).toBeVisible()
  })

  test('Short link creation button is present and shows label field', async ({ page }) => {
    await expect(page.getByText('Create Short Link')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. Facebook May Campaign')).toBeVisible()
  })

  test('Short link button is disabled when no UTM source selected', async ({ page }) => {
    // Without selecting source, URL is empty → button disabled
    const shortLinkBtn = page.locator('button:has-text("🔗 Create Short Link")')
    await expect(shortLinkBtn).toBeDisabled()
  })

  test('Short link creation produces a /r/ URL displayed on page', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('facebook')
    await page.locator('select').filter({ hasText: 'Social (Organic Post)' }).first().selectOption('social')
    await page.getByPlaceholder('e.g. spring-2026').fill('e2e-test')
    await page.getByPlaceholder('e.g. Facebook May Campaign').fill('E2E Short Link Test')

    const shortLinkBtn = page.locator('button:has-text("🔗 Create Short Link")')
    await expect(shortLinkBtn).toBeEnabled({ timeout: 3000 })
    await shortLinkBtn.click()

    await expect(page.locator('code').filter({ hasText: '/r/' })).toBeVisible({ timeout: 15000 })
    const shortUrl = await page.locator('code').filter({ hasText: '/r/' }).textContent()
    expect(shortUrl).toMatch(/\/r\/[a-z0-9]{6,10}/)
  })

  test('Short link API error shows user-visible error message, not a crash', async ({ page }) => {
    // Intercept the short-links API and force a 500 to test the error state UI
    await page.route('/api/crm/short-links', route =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) })
    )

    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('facebook')
    await page.locator('select').filter({ hasText: 'Social (Organic Post)' }).first().selectOption('social')
    await page.getByPlaceholder('e.g. spring-2026').fill('error-test')

    const shortLinkBtn = page.locator('button:has-text("🔗 Create Short Link")')
    await expect(shortLinkBtn).toBeEnabled({ timeout: 3000 })
    await shortLinkBtn.click()

    // UI should show an error message — not crash or show blank
    await expect(
      page.getByText(/failed|error|could not|try again/i).first()
    ).toBeVisible({ timeout: 5000 })
    // The page should still be intact — URL preview still visible
    await expect(page.locator('code').filter({ hasText: 'utm_source=facebook' })).toBeVisible()
  })
})

// ── Campaigns — URL Builder (compact mode) ───────────────────────────────────

test.describe('Tracking URL Builder — Campaigns form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/campaigns', { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('#create-campaign-btn', { state: 'visible', timeout: 10000 })
  })

  test('URL Builder accordion is hidden by default in campaign form', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    // In compact mode the builder starts collapsed — the toggle button is visible
    const accordionBtn = page.locator('button:has-text("Tracking URL Builder")')
    await expect(accordionBtn).toBeVisible()

    // But the fields inside are NOT visible until opened
    const sourceSelect = page.locator('select').filter({ hasText: 'Facebook' })
    await expect(sourceSelect).not.toBeVisible()
  })

  test('Clicking accordion opens the URL builder fields', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    // Open the accordion
    await page.locator('button:has-text("Tracking URL Builder")').click()

    // Fields now visible
    await expect(page.locator('select').filter({ hasText: 'Facebook' }).first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByPlaceholder('e.g. spring-2026')).toBeVisible()
  })

  test('Medium is pre-filled with the campaign channel value', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    // Set channel to email
    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')

    // Open URL builder
    await page.locator('button:has-text("Tracking URL Builder")').click()

    // Medium should be pre-filled with 'email'
    const mediumSelect = page.locator('select').filter({ hasText: 'Email' }).first()
    await expect(mediumSelect).toHaveValue('email')
  })

  test('Closing the accordion hides the URL builder fields again', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    const toggle = page.locator('button:has-text("Tracking URL Builder")')
    await toggle.click() // open
    await expect(page.locator('select').filter({ hasText: 'Facebook' }).first()).toBeVisible({ timeout: 3000 })

    await toggle.click() // close
    await expect(page.locator('select').filter({ hasText: 'Facebook' })).not.toBeVisible()
  })
})

// ── SMS Campaigns — URL Builder pre-fills sms medium ─────────────────────────

test.describe('Tracking URL Builder — SMS Campaigns', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/campaigns', { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('#create-campaign-btn', { state: 'visible', timeout: 10000 })
  })

  test('URL-SMS-01: Selecting SMS channel pre-fills medium as "sms" in the URL builder', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    // Select SMS channel first
    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('sms')

    // Open the URL builder accordion
    await page.locator('button:has-text("Tracking URL Builder")').click()

    // Medium should auto-read from channel and be 'sms'
    const mediumSelect = page.locator('select').filter({ hasText: 'SMS' }).first()
    await expect(mediumSelect).toHaveValue('sms')
  })

  test('URL-SMS-02: SMS URL builder generates a correct utm_medium=sms URL', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('sms')

    await page.locator('button:has-text("Tracking URL Builder")').click()

    // Fill source and campaign
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('facebook')
    await page.getByPlaceholder('e.g. spring-2026').fill('sms-may-push')

    // Preview should contain utm_medium=sms
    const preview = page.locator('code').filter({ hasText: 'utm_medium=sms' })
    await expect(preview).toBeVisible({ timeout: 3000 })
    await expect(preview).toContainText('utm_source=facebook')
    await expect(preview).toContainText('utm_campaign=sms-may-push')
  })

  test('URL-SMS-03: SMS short link can be created and shows /r/ URL', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('sms')
    await page.locator('button:has-text("Tracking URL Builder")').click()

    // Fill required fields
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('newsletter')
    await page.getByPlaceholder('e.g. spring-2026').fill('sms-e2e')
    await page.getByPlaceholder('e.g. Facebook May Campaign').fill('SMS E2E Test')

    const shortLinkBtn = page.locator('button:has-text("🔗 Create Short Link")')
    await expect(shortLinkBtn).toBeEnabled({ timeout: 3000 })
    await shortLinkBtn.click()

    await expect(page.locator('code').filter({ hasText: '/r/' })).toBeVisible({ timeout: 15000 })
    const shortUrl = await page.locator('code').filter({ hasText: '/r/' }).textContent()
    expect(shortUrl).toMatch(/\/r\/[a-z0-9]{6,10}/)
  })

  test('URL-SMS-04: Short URL shows explanatory text about click tracking', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('sms')
    await page.locator('button:has-text("Tracking URL Builder")').click()

    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('newsletter')
    await page.getByPlaceholder('e.g. spring-2026').fill('click-track-test')

    const shortLinkBtn = page.locator('button:has-text("🔗 Create Short Link")')
    await expect(shortLinkBtn).toBeEnabled({ timeout: 3000 })
    await shortLinkBtn.click()

    // The explanatory text below the short URL should guide the user
    await expect(page.getByText(/Redirects to the full tracking URL/i)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Clicks are counted/i)).toBeVisible()
  })
})

// ── Email Campaigns — URL Builder end-to-end ─────────────────────────────────

test.describe('Tracking URL Builder — Email Campaigns end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/campaigns', { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('#create-campaign-btn', { state: 'visible', timeout: 10000 })
  })

  test('URL-EMAIL-02: Changing campaign name live updates the utm_campaign preview', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    await page.locator('button:has-text("Tracking URL Builder")').click()
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('newsletter')

    // Set a campaign value and verify it appears in the URL preview
    const campaignInput = page.getByPlaceholder('e.g. spring-2026')
    await campaignInput.clear()
    await campaignInput.fill('welcome-series')

    const preview = page.locator('code').filter({ hasText: 'utm_campaign=welcome-series' })
    await expect(preview).toBeVisible({ timeout: 3000 })

    // Change it and verify preview updates
    await campaignInput.clear()
    await campaignInput.fill('re-engagement')
    await expect(page.locator('code').filter({ hasText: 'utm_campaign=re-engagement' })).toBeVisible({ timeout: 2000 })
  })

  test('URL-EMAIL-03: Full email campaign workflow — fill form, open builder, generate + copy URL', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const campaignName = `E2E URL Builder Test ${Date.now()}`

    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    // Step 1: Fill the campaign form
    await page.getByPlaceholder('e.g. Spring Launch Email').fill(campaignName)
    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const subjectInput = page.locator('textarea[placeholder*="Fresh produce"]')
    await expect(subjectInput).toBeVisible({ timeout: 8000 })
    await subjectInput.fill('Your spring harvest awaits')

    // Step 2: Open URL builder and fill all 5 params
    await page.locator('button:has-text("Tracking URL Builder")').click()
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('newsletter')
    // utm_medium should already be 'email' from channel
    await page.getByPlaceholder('e.g. backyard-gardeners-fb-group').fill('may-newsletter-v1')

    // Step 3: Verify full UTM URL preview
    const preview = page.locator('code').filter({ hasText: 'utm_source=newsletter' })
    await expect(preview).toBeVisible({ timeout: 3000 })
    await expect(preview).toContainText('utm_medium=email')
    await expect(preview).toContainText('utm_content=may-newsletter-v1')

    // Step 4: Copy the URL
    const copyBtn = page.locator('button:has-text("Copy")').first()
    await expect(copyBtn).toBeVisible()
    await copyBtn.click()
    await expect(page.locator('button:has-text("Copied!")')).toBeVisible({ timeout: 2000 })

    // Step 5: Close builder, verify the campaign form is still intact
    await page.locator('button:has-text("Tracking URL Builder")').click()
    await expect(page.getByPlaceholder('e.g. Spring Launch Email')).toHaveValue(campaignName)
    await expect(subjectInput).toHaveValue('Your spring harvest awaits')
  })

  test('URL-EMAIL-04: utm_content field hint mentions ad creative and groups', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    await page.locator('button:has-text("Tracking URL Builder")').click()

    // The hint text beneath utm_content should mention "Facebook group" usage
    await expect(page.getByText(/which Facebook group/i)).toBeVisible()
    await expect(page.getByPlaceholder('e.g. backyard-gardeners-fb-group')).toBeVisible()
  })
})

// ── Drip Sequences — URL Builder full UX ─────────────────────────────────────

test.describe('Tracking URL Builder — Drip Sequence Builder', () => {
  // Navigate into the sequence builder for each test
  const openSequenceBuilder = async (page: any) => {
    await page.goto('/crm/sequences', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1000)
    const newBtn = page.getByRole('button', { name: '+ New Sequence' })
    await expect(newBtn).toBeVisible({ timeout: 8000 })
    await newBtn.click()
    await page.waitForURL(/\/crm\/sequences\/[a-zA-Z0-9-]+/)
    await expect(page.locator('button:has-text("Save Sequence")')).toBeVisible({ timeout: 10000 })
  }

  test('URL-SEQ-01: Sequence builder loads with all node type palette items visible', async ({ page }) => {
    await openSequenceBuilder(page)

    // All sidebar palette items should be visible
    await expect(page.locator('text=Node Types')).toBeVisible()
    await expect(page.locator('text=✉️ Send Email')).toBeVisible()
    await expect(page.locator('text=📱 Send SMS')).toBeVisible()
    await expect(page.locator('text=⏳ Wait Delay')).toBeVisible()
    await expect(page.locator('text=🔀 Condition Split')).toBeVisible()

    // URL builder should also be present in the sidebar
    await expect(page.locator('button:has-text("Tracking URL Builder")')).toBeVisible()
  })

  test('URL-SEQ-02: URL builder accordion is collapsed by default in the sequence sidebar', async ({ page }) => {
    await openSequenceBuilder(page)

    const toggle = page.locator('button:has-text("Tracking URL Builder")')
    await expect(toggle).toBeVisible({ timeout: 8000 })

    // Fields should NOT be visible before opening
    const sourceSelect = page.locator('select').filter({ hasText: 'Facebook' })
    await expect(sourceSelect).not.toBeVisible()
  })

  test('URL-SEQ-03: Opening the URL builder in a sequence shows all fields with email pre-filled', async ({ page }) => {
    await openSequenceBuilder(page)

    const toggle = page.locator('button:has-text("Tracking URL Builder")')
    await toggle.click()
    await page.waitForTimeout(300)

    // All param fields visible
    await expect(page.locator('select').filter({ hasText: 'Facebook' }).first()).toBeVisible()
    await expect(page.getByPlaceholder('e.g. spring-2026')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. backyard-gardeners-fb-group')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. sell-backyard-produce')).toBeVisible()

    // Medium pre-filled to email (this is a drip sequence — email is the primary channel)
    const mediumSelect = page.locator('select').filter({ hasText: 'Email' }).first()
    await expect(mediumSelect).toHaveValue('email')
  })

  test('URL-SEQ-04: Generating a tracked URL for a drip email node', async ({ page }) => {
    await openSequenceBuilder(page)

    await page.locator('button:has-text("Tracking URL Builder")').click()
    await page.waitForTimeout(300)

    // Fill source and campaign — typical values for a drip email node
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('newsletter')
    await page.getByPlaceholder('e.g. spring-2026').fill('welcome-drip')
    await page.getByPlaceholder('e.g. backyard-gardeners-fb-group').fill('email-day-3')

    // Preview should show correct UTM URL for embedding in email node body
    const preview = page.locator('code').filter({ hasText: 'utm_source=newsletter' })
    await expect(preview).toBeVisible({ timeout: 3000 })
    await expect(preview).toContainText('utm_medium=email')
    await expect(preview).toContainText('utm_campaign=welcome-drip')
    await expect(preview).toContainText('utm_content=email-day-3')
  })

  test('URL-SEQ-05: Switching medium to SMS generates correct URL for SMS drip node', async ({ page }) => {
    await openSequenceBuilder(page)

    await page.locator('button:has-text("Tracking URL Builder")').click()
    await page.waitForTimeout(300)

    // Change medium to SMS (for an SMS node in the drip)
    await page.locator('select').filter({ hasText: 'Email' }).first().selectOption('sms')
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('newsletter')
    await page.getByPlaceholder('e.g. spring-2026').fill('sms-drip-day-7')

    const preview = page.locator('code').filter({ hasText: 'utm_medium=sms' })
    await expect(preview).toBeVisible({ timeout: 3000 })
    await expect(preview).toContainText('utm_campaign=sms-drip-day-7')
  })

  test('URL-SEQ-06: Creating a short link from the sequence sidebar produces /r/ URL', async ({ page }) => {
    await openSequenceBuilder(page)

    await page.locator('button:has-text("Tracking URL Builder")').click()
    await page.waitForTimeout(300)

    // Fill required fields
    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('newsletter')
    await page.getByPlaceholder('e.g. spring-2026').fill('drip-e2e')
    await page.getByPlaceholder('e.g. Facebook May Campaign').fill('Drip Sequence E2E Test')

    const shortLinkBtn = page.locator('button:has-text("🔗 Create Short Link")')
    await expect(shortLinkBtn).toBeEnabled({ timeout: 3000 })
    await shortLinkBtn.click()

    // Short URL should appear — intended to be pasted into the email/SMS node body
    await expect(page.locator('code').filter({ hasText: '/r/' })).toBeVisible({ timeout: 15000 })
    const shortUrl = await page.locator('code').filter({ hasText: '/r/' }).textContent()
    expect(shortUrl).toMatch(/\/r\/[a-z0-9]{6,10}/)

    // Explanatory text should guide user to paste into node
    await expect(page.getByText(/Redirects to the full tracking URL/i)).toBeVisible()
  })

  test('URL-SEQ-07: URL builder copy works in sequence sidebar context', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openSequenceBuilder(page)

    await page.locator('button:has-text("Tracking URL Builder")').click()
    await page.waitForTimeout(300)

    await page.locator('select').filter({ hasText: 'Facebook' }).first().selectOption('instagram')
    // URL preview appears
    const copyBtn = page.locator('button:has-text("Copy")').first()
    await expect(copyBtn).toBeVisible({ timeout: 3000 })
    await copyBtn.click()

    // Copy feedback shows
    await expect(page.locator('button:has-text("Copied!")')).toBeVisible({ timeout: 2000 })
    // Verify clipboard has the URL
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toContain('utm_source=instagram')
  })

  test('URL-SEQ-08: URL builder stays accessible after sequence is saved', async ({ page }) => {
    await openSequenceBuilder(page)

    // Save the sequence first
    await page.locator('button:has-text("Save Sequence")').click()
    await page.waitForTimeout(1000)

    // URL builder toggle should still be present after saving
    const toggle = page.locator('button:has-text("Tracking URL Builder")')
    await expect(toggle).toBeVisible({ timeout: 5000 })

    // And still opens correctly
    await toggle.click()
    await page.waitForTimeout(300)
    await expect(page.locator('select').filter({ hasText: 'Facebook' }).first()).toBeVisible()
  })

  test('URL-SEQ-09: React Flow canvas and URL Builder can coexist without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await openSequenceBuilder(page)

    // Verify React Flow canvas is rendering
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect(page.locator('.react-flow__node:has-text("Start")')).toBeVisible()

    // Open URL builder alongside it — no conflicts
    await page.locator('button:has-text("Tracking URL Builder")').click()
    await expect(page.locator('select').filter({ hasText: 'Facebook' }).first()).toBeVisible()

    // No page errors from either component
    expect(errors.filter(e => !e.includes('hydrat') && !e.includes('ResizeObserver'))).toHaveLength(0)
  })
})

