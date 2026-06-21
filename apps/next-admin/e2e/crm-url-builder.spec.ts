/**
 * Tracking URL Builder — Admin E2E Tests
 *
 * Tests the TrackingUrlBuilder component embedded in:
 *   1. CRM → Landing Pages (/crm/landing-pages) — full mode (selectedPage context)
 *   2. CRM → Campaigns (/crm/campaigns) — compact/accordion mode via link picker
 *
 * Auth: Handled by setup project storageState.
 * Run: cd apps/next-admin && npx playwright test e2e/crm-url-builder.spec.ts
 */
import { test, expect, type Page } from '@playwright/test'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Select a UTM source by value. The source dropdown is inside the label "Source *" */
async function selectSource(page: Page, value: string) {
  const sourceLabel = page.locator('label:has-text("Source")')
  // The select is a sibling after the label — use parent container
  const container = sourceLabel.locator('..')
  await container.locator('select').selectOption(value)
}

/** Select a UTM medium by value. The medium dropdown is inside the label "Medium *" */
async function selectMedium(page: Page, value: string) {
  const mediumLabel = page.locator('label:has-text("Medium")')
  const container = mediumLabel.locator('..')
  await container.locator('select').selectOption(value)
}

/**
 * Registers a test landing page and clicks it to reveal the TrackingUrlBuilder.
 * The builder only renders when a row is selected (selectedPage context).
 */
async function registerAndSelectLandingPage(page: Page) {
  const uniqueName = `E2E URL Test ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // Open the registration form
  await page.click('button:has-text("+ Register Page")')
  const nameInput = page.locator('input[placeholder*="Spring Growers"]').first()
  await expect(nameInput).toBeVisible({ timeout: 10000 })
  await nameInput.fill(uniqueName)

  // Click the submit button inside the form actions (not the header "+" button)
  await page.locator('.crm-form-actions button.crm-btn-primary', { hasText: 'Register Page' }).click()

  // Wait for the form to close and the table to update
  // The form disappearing is the most reliable signal
  await expect(nameInput).not.toBeVisible({ timeout: 15000 })

  // Wait for the row to appear in the table
  const row = page.locator('tr', { hasText: uniqueName }).first()
  await expect(row).toBeVisible({ timeout: 10000 })

  // Click the row to reveal the URL builder
  await row.click()

  // Wait for the TrackingUrlBuilder to appear
  await expect(page.getByText('Tracking URL Builder')).toBeVisible({ timeout: 5000 })
}

// ── Landing Pages — URL Builder (selectedPage mode) ──────────────────────────

test.describe('Tracking URL Builder — Landing Pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/landing-pages', { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('button:has-text("+ Register Page")', { state: 'visible', timeout: 10000 })
  })

  test('URL Builder renders when a landing page row is selected', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    // Builder should NOT be visible initially
    await expect(page.getByText('Tracking URL Builder')).not.toBeVisible()

    // Register and select a page to reveal the builder
    await registerAndSelectLandingPage(page)

    await expect(page.getByText('Tracking URL Builder')).toBeVisible()
    await expect(page.getByText('Build UTM-tagged links')).toBeVisible()

    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('Source dropdown contains expected channels', async ({ page }) => {
    await registerAndSelectLandingPage(page)

    const sourceLabel = page.locator('label:has-text("Source")')
    const sourceSelect = sourceLabel.locator('..').locator('select')
    await expect(sourceSelect).toBeVisible()

    await expect(sourceSelect.locator('option[value="facebook"]')).toHaveCount(1)
    await expect(sourceSelect.locator('option[value="instagram"]')).toHaveCount(1)
    await expect(sourceSelect.locator('option[value="nextdoor"]')).toHaveCount(1)
    await expect(sourceSelect.locator('option[value="google"]')).toHaveCount(1)
    await expect(sourceSelect.locator('option[value="newsletter"]')).toHaveCount(1)
  })

  test('Medium dropdown contains expected channel types', async ({ page }) => {
    await registerAndSelectLandingPage(page)

    const mediumLabel = page.locator('label:has-text("Medium")')
    const mediumSelect = mediumLabel.locator('..').locator('select')
    await expect(mediumSelect).toBeVisible()

    await expect(mediumSelect.locator('option[value="social"]')).toHaveCount(1)
    await expect(mediumSelect.locator('option[value="email"]')).toHaveCount(1)
    await expect(mediumSelect.locator('option[value="sms"]')).toHaveCount(1)
    await expect(mediumSelect.locator('option[value="cpc"]')).toHaveCount(1)
  })

  test('Filling UTM fields generates a live URL preview', async ({ page }) => {
    await registerAndSelectLandingPage(page)

    await selectSource(page, 'facebook')
    await selectMedium(page, 'social')
    await page.getByPlaceholder('e.g. spring-2026').fill('may-seller-push')
    await page.getByPlaceholder('e.g. backyard-gardeners-fb-group').fill('fresno-gardeners-group')

    const preview = page.locator('code').filter({ hasText: 'utm_source=facebook' })
    await expect(preview).toBeVisible({ timeout: 3000 })
    await expect(preview).toContainText('utm_medium=social')
    await expect(preview).toContainText('utm_campaign=may-seller-push')
    await expect(preview).toContainText('utm_content=fresno-gardeners-group')
  })

  test('utm_term field is present with hint text about Facebook groups', async ({ page }) => {
    await registerAndSelectLandingPage(page)

    await expect(page.getByPlaceholder('e.g. sell-backyard-produce')).toBeVisible()
    await expect(page.getByText(/prefer.*Content.*above/i)).toBeVisible()
  })

  test('utm_term value appears in generated URL', async ({ page }) => {
    await registerAndSelectLandingPage(page)

    await selectSource(page, 'google')
    await selectMedium(page, 'cpc')
    await page.getByPlaceholder('e.g. sell-backyard-produce').fill('sell home produce near me')

    const preview = page.locator('code').filter({ hasText: 'utm_term=' })
    await expect(preview).toBeVisible({ timeout: 3000 })
    await expect(preview).toContainText('utm_term=sell+home+produce+near+me')
  })

  test('Copy button appears and is clickable once URL is generated', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await registerAndSelectLandingPage(page)

    await selectSource(page, 'instagram')
    await selectMedium(page, 'social')

    const copyBtn = page.locator('button:has-text("📋 Copy")').first()
    await expect(copyBtn).toBeVisible({ timeout: 3000 })
    await copyBtn.click()

    await expect(page.locator('button:has-text("✓ Copied!")')).toBeVisible({ timeout: 2000 })
  })

  test('Reset button clears all fields and hides URL preview', async ({ page }) => {
    await registerAndSelectLandingPage(page)

    await selectSource(page, 'facebook')
    await page.getByPlaceholder('e.g. spring-2026').fill('test-campaign')

    await expect(page.locator('code').filter({ hasText: 'utm_source=facebook' })).toBeVisible({ timeout: 3000 })

    await page.getByText('↺ Reset').click()

    await expect(page.locator('code').filter({ hasText: 'utm_source=facebook' })).not.toBeVisible()
  })

  test('Short link creation button is present and shows label field', async ({ page }) => {
    await registerAndSelectLandingPage(page)

    await expect(page.getByText('Create Short Link')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. Facebook May Campaign')).toBeVisible()
  })

  test('Short link button is enabled when landing page provides base URL', async ({ page }) => {
    await registerAndSelectLandingPage(page)

    // When a landing page is selected, the base URL is pre-filled (defaultBaseUrl),
    // so the short link button should be enabled immediately
    const shortLinkBtn = page.locator('button:has-text("🔗 Create Short Link")')
    await expect(shortLinkBtn).toBeEnabled()
  })

  test('Short link API error shows user-visible error message, not a crash', async ({ page }) => {
    await registerAndSelectLandingPage(page)

    await page.route('/api/crm/short-links', route =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) })
    )

    await selectSource(page, 'facebook')
    await selectMedium(page, 'social')
    await page.getByPlaceholder('e.g. spring-2026').fill('error-test')

    const shortLinkBtn = page.locator('button:has-text("🔗 Create Short Link")')
    await expect(shortLinkBtn).toBeEnabled({ timeout: 3000 })
    await shortLinkBtn.click()

    await expect(
      page.getByText(/failed|error|could not|try again/i).first()
    ).toBeVisible({ timeout: 5000 })
    await expect(page.locator('code').filter({ hasText: 'utm_source=facebook' })).toBeVisible()
  })

  test('Destination Page dropdown is hidden when landing page pre-selects the URL', async ({ page }) => {
    await registerAndSelectLandingPage(page)

    // When a landing page is selected, defaultBaseUrl is set — the Destination dropdown
    // and Custom URL toggle should NOT be visible
    await expect(page.locator('label:has-text("Destination Page")')).not.toBeVisible()
    await expect(page.getByText('Custom URL')).not.toBeVisible()
  })
})

// ── Campaigns — Link Picker modal (replaces old accordion URL builder) ───────

test.describe('Link Picker — Campaigns form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/campaigns', { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('#create-campaign-btn', { state: 'visible', timeout: 10000 })
  })

  test('Link picker modal opens from WYSIWYG link toolbar button', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    // Select Email + Custom HTML
    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    // Click the Quill toolbar link button
    const linkBtn = page.locator('.ql-link')
    await expect(linkBtn).toBeVisible({ timeout: 5000 })
    await linkBtn.click()

    // Verify unified link picker modal appears
    await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('Search promotions or landing pages...')).toBeVisible()
  })

  test('Link picker modal has UTM tracking fields and insert buttons', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    // Open link picker
    const linkBtn = page.locator('.ql-link')
    await expect(linkBtn).toBeVisible({ timeout: 5000 })
    await linkBtn.click()
    await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })

    // Click a Marketing Page link (e.g. Seller Calculator)
    const marketingPage = page.locator('button', { hasText: /Seller Calculator/ })
    if (await marketingPage.count() > 0) {
      await marketingPage.first().click()
    } else {
      // Fallback: click any visible link button in the scrollable area
      const anyBtn = page.locator('div[style*="overflowY"] button').first()
      await expect(anyBtn).toBeVisible({ timeout: 3000 })
      await anyBtn.click()
    }

    // After selecting a URL, step 2 should show with UTM fields
    await expect(page.getByText('Add Tracking')).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('e.g. summer-kickoff')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. backyard-gardeners-fb-group')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. sell-backyard-produce')).toBeVisible()

    // Both insert buttons should be visible
    await expect(page.locator('button:has-text("Insert Link")')).toBeVisible()
    await expect(page.locator('button:has-text("Insert & Shorten")')).toBeVisible()
  })

  test('Marketing Pages section includes /growbot and /create-listing presets', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    // Open link picker
    await page.locator('.ql-link').click()
    await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })

    // Both new presets should be visible in Marketing Pages
    await expect(page.locator('button', { hasText: /GrowBot AI Chat/ })).toBeVisible({ timeout: 3000 })
    await expect(page.locator('button', { hasText: /Create a Listing/ })).toBeVisible({ timeout: 3000 })
  })

  test('Marketing Pages /growbot preset navigates to UTM step with correct URL', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    // Open link picker and click GrowBot preset
    await page.locator('.ql-link').click()
    await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })
    await page.locator('button', { hasText: /GrowBot AI Chat/ }).first().click()

    // UTM step should appear with /growbot in the URL preview
    await expect(page.getByText('Add Tracking')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('div', { hasText: '/growbot' }).first()).toBeVisible()
  })

  test('Copy a Link button opens link picker in clipboard mode', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    // "Copy a Link..." button is visible
    const copyBtn = page.locator('button:has-text("Copy a Link...")')
    await expect(copyBtn).toBeVisible({ timeout: 5000 })
    await copyBtn.click()

    // Verify link picker modal opens
    await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })
  })
})

// ── Email Campaigns — URL Builder end-to-end ─────────────────────────────────

test.describe('Tracking URL Builder — Email Campaigns end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/campaigns', { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('#create-campaign-btn', { state: 'visible', timeout: 10000 })
  })

  test('URL-EMAIL-02: UTM fields in link picker step 2 are interactive', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    // Open link picker and select a URL
    await page.locator('.ql-link').click()
    await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })

    // Click a Marketing Page link (e.g. Seller Calculator)
    const marketingPage = page.locator('button', { hasText: /Seller Calculator/ })
    if (await marketingPage.count() > 0) {
      await marketingPage.first().click()
    } else {
      const anyBtn = page.locator('div[style*="overflowY"] button').first()
      await expect(anyBtn).toBeVisible({ timeout: 3000 })
      await anyBtn.click()
    }

    // Fill UTM fields
    const campaignInput = page.getByPlaceholder('e.g. summer-kickoff')
    if (await campaignInput.isVisible()) {
      await campaignInput.fill('welcome-series')
      await expect(campaignInput).toHaveValue('welcome-series')
    }
  })

  test('URL-EMAIL-04: utm_term (Keyword/Group Tag) and Short Link Label fields are present', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    // Open link picker and select a URL
    await page.locator('.ql-link').click()
    await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })

    // Click a Marketing Page link
    const marketingPage = page.locator('button', { hasText: /Seller Calculator/ })
    if (await marketingPage.count() > 0) {
      await marketingPage.first().click()
    } else {
      const anyBtn = page.locator('div[style*="overflowY"] button').first()
      await expect(anyBtn).toBeVisible({ timeout: 3000 })
      await anyBtn.click()
    }

    // Verify utm_term and label fields
    await expect(page.getByPlaceholder('e.g. sell-backyard-produce')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Keyword / Group Tag')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. Facebook May Campaign')).toBeVisible()
    await expect(page.getByText('Short Link Label')).toBeVisible()
  })

  test('Custom URL input can insert an untracked link directly', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    // Open link picker
    await page.locator('.ql-link').click()
    await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })

    // Fill Custom URL and label
    const customUrlInput = page.getByPlaceholder('https://youtube.com/watch?v=... or mailto:...')
    await expect(customUrlInput).toBeVisible({ timeout: 3000 })
    await customUrlInput.fill('https://youtube.com/watch?v=custom123')
    
    const customLabelInput = page.getByPlaceholder('Link Text / Label (Optional)')
    await customLabelInput.fill('My Custom Video')

    // Click Insert Untracked
    const insertUntrackedBtn = page.locator('button:has-text("Insert Untracked")')
    await expect(insertUntrackedBtn).toBeEnabled()
    await insertUntrackedBtn.click()

    // Modal should close
    await expect(page.getByText('Insert Tracked Link')).not.toBeVisible({ timeout: 5000 })

    // Verify content of quill editor contains the link
    const editorContent = page.locator('.ql-editor a')
    await expect(editorContent).toBeVisible({ timeout: 5000 })
    await expect(editorContent).toHaveAttribute('href', 'https://youtube.com/watch?v=custom123')
    await expect(editorContent).toHaveText('My Custom Video')
  })

  test('Image wrapping in custom link and link removal', async ({ page }) => {
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    // Insert image — wait for editor to be visible first
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 10000 })
    const testImageUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    await page.evaluate((url: string) => {
      const editor = document.querySelector('.ql-editor')
      if (!editor) return
      const img = document.createElement('img')
      img.src = url
      img.setAttribute('data-image-blot', 'true')
      editor.appendChild(img)
    }, testImageUrl)
    await page.waitForTimeout(300)

    // Click the image (our new click interceptor will open the link picker modal)
    const imgLocator = page.locator('.ql-editor img').first()
    await expect(imgLocator).toBeVisible({ timeout: 5000 })
    await imgLocator.click()

    // Link picker modal should open
    await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })

    // Fill Custom URL and insert untracked
    const customUrlInput = page.getByPlaceholder('https://youtube.com/watch?v=... or mailto:...')
    await customUrlInput.fill('https://alerts.casagrown.com')
    await page.locator('button:has-text("Insert Untracked")').click()

    // Modal closes
    await expect(page.getByText('Insert Tracked Link')).not.toBeVisible({ timeout: 5000 })

    // Verify image is wrapped inside the link
    const wrappedImg = page.locator('.ql-editor a[href*="alerts.casagrown.com"] img')
    await expect(wrappedImg).toBeVisible({ timeout: 5000 })

    // Click linked image again -> should open Edit Link Tracking modal
    await wrappedImg.click({ force: true })
    await expect(page.getByText('Edit Link Tracking')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/alerts\.casagrown\.com/)).toBeVisible()

    // Click Remove Link
    await page.locator('button:has-text("Remove Link")').click()

    // Modal closes and link is removed, leaving only the image
    await expect(page.getByText('Edit Link Tracking')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('.ql-editor a')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('.ql-editor img')).toBeVisible({ timeout: 5000 })
  })
})
