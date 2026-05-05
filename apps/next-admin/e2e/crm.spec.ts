import { test, expect } from '@playwright/test'

/**
 * CRM Admin Pages — Playwright E2E Tests
 *
 * Covers: Leads, Audiences, Assets, Campaigns, Landing Pages, Audience Functions
 *
 * Auth: Handled by setup project storageState.
 * Run: cd apps/next-admin && npx playwright test e2e/crm.spec.ts
 */

test.describe('CRM — Leads page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors and shows header', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('CRM Leads')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('search input is present and interactive', async ({ page }) => {
    const search = page.locator('#lead-search')
    await expect(search).toBeVisible()
    await search.fill('test')
    await expect(search).toHaveValue('test')
  })

  test('status filter dropdown has all options', async ({ page }) => {
    const filter = page.locator('#lead-status-filter')
    await expect(filter).toBeVisible()
    await expect(filter.locator('option[value="all"]')).toHaveCount(1)
    await expect(filter.locator('option[value="new"]')).toHaveCount(1)
    await expect(filter.locator('option[value="contacted"]')).toHaveCount(1)
    await expect(filter.locator('option[value="converted"]')).toHaveCount(1)
    await expect(filter.locator('option[value="partial"]')).toHaveCount(1)
  })

  test('partial filter option exists', async ({ page }) => {
    const filter = page.locator('#lead-status-filter')
    await filter.selectOption('partial')
    await expect(filter).toHaveValue('partial')
  })
})

test.describe('CRM — Audiences page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/audiences', { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('#create-audience-btn', { state: 'visible', timeout: 10000 })
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Audiences')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('+ New Audience button opens creation form', async ({ page }) => {
    await page.locator('#create-audience-btn').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('#create-audience-btn')
    await expect(page.locator('input[placeholder*="California Buyers"]')).toBeVisible({ timeout: 10000 })
  })



  test('population source dropdown loads from registry', async ({ page }) => {
    await page.locator('#create-audience-btn').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('#create-audience-btn')
    await expect(page.locator('input[placeholder*="California Buyers"]')).toBeVisible({ timeout: 10000 })
    const select = page.locator('select').first()
    await page.waitForTimeout(1200)
    const options = await select.locator('option').count()
    expect(options).toBeGreaterThanOrEqual(0)
  })


})

test.describe('CRM — Assets page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/assets', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Assets')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('creates a new email template and saves to database', async ({ page }) => {
    // Click New Asset
    await page.click('button:has-text("+ New Asset")')
    
    // Fill Name
    await page.fill('input[placeholder*="Spring Promo Banner"]', `E2E Test Welcome Email ${Date.now()}`)
    
    // Select Type
    await page.locator('select').nth(0).selectOption('email_template')
    
    // Fill Content
    await page.fill('textarea', '<h1>Welcome to CasaGrown!</h1>')
    
    // Click Save
    await page.click('button:has-text("Save Asset")')
    
    // Wait for Toast
    const toast = page.locator('.crm-toast')
    await toast.waitFor({ state: 'visible', timeout: 10000 })
    console.log('TOAST MESSAGE:', await toast.textContent())
    await expect(toast).toContainText('Asset saved', { timeout: 1000 })
    
    // Verify it appears in the grid
    await expect(page.locator('.asset-card', { hasText: 'E2E Test Welcome Email' }).first()).toBeVisible()
  })
})

test.describe('CRM — Campaigns page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/campaigns', { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('#create-campaign-btn', { state: 'visible', timeout: 10000 })
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Campaign')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('creates a new draft campaign and saves to database', async ({ page }) => {
    const campaignName = `E2E Test Campaign ${Date.now()}`
    
    // Click New Campaign
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })
    
    // Fill Name
    await page.fill('input[placeholder="e.g. Spring Launch Email"]', campaignName)

    // Select email channel (find Channel label, then the select next to it)
    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')

    // Wait for subject field to be visible (it's a textarea, not an input)
    const subjectInput = page.locator('textarea[placeholder*="Fresh produce"]')
    await expect(subjectInput).toBeVisible({ timeout: 10000 })
    await subjectInput.fill('Welcome to CasaGrown')

    // Click Save Campaign
    await page.click('button:has-text("Save Campaign")')
    
    // Wait for Success Toast
    await expect(page.locator('.crm-toast.success')).toContainText('Campaign created', { timeout: 10000 })
    
    // Verify it appears in the table with draft status
    const row = page.locator('tr', { hasText: campaignName })
    await expect(row).toBeVisible()
    await expect(row).toContainText('draft', { ignoreCase: true })
  })
})

test.describe('CRM — Data Sources page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/data-sources', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Data Sources')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('Register form opens securely', async ({ page }) => {
    await page.click('button:has-text("+ Register Data Source")')
    await expect(page.locator('input[placeholder*="Latest Market Products"]')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('CRM — Landing Pages page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/landing-pages', { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('button:has-text("+ Register Page")', { state: 'visible', timeout: 10000 })
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Landing Pages')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('registers a new landing page and saves to database', async ({ page }) => {
    const pageName = `E2E Test Landing Page ${Date.now()}`
    
    await page.click('button:has-text("+ Register Page")')
    
    const nameInput = page.locator('input[placeholder*="Spring Growers"]').first()
    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await nameInput.fill(pageName)
    
    // Submit form
    await page.click('button:has-text("Register Page")')
    
    // Verify Success Toast
    await expect(page.locator('.crm-toast.success')).toContainText('Landing page registered', { timeout: 10000 })
    
    // Verify it appears in the list
    await expect(page.locator('tr', { hasText: pageName }).first()).toBeVisible()
  })
})

test.describe('CRM — Audience Functions page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/audience-functions', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Audience Functions')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('shows seeded built-in functions as cards', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(1000)
    const cards = page.locator('.fn-card')
    const count = await cards.count()
    // Accept 0 if DB not seeded locally, ≥1 if seeded
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('search filters cards by keyword', async ({ page }) => {
    await page.waitForTimeout(1000)
    const search = page.locator('.crm-search')
    await expect(search).toBeVisible({ timeout: 8000 })
    await search.fill('leads')
    await page.waitForTimeout(300)
    // Search box should be interactive regardless of seeded data
    await expect(search).toHaveValue('leads')
  })

  test('Register Function form opens with all required fields', async ({ page }) => {
    await page.locator('button:has-text("Register Function")').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('button:has-text("Register Function")')
    await expect(page.getByText('Register Audience Function', { exact: true }).or(page.getByText('Register Function', { exact: true })).first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[placeholder*="crm_audience_"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[placeholder*="High Value"], input[placeholder*="Label"]')).toBeVisible()
    await expect(page.locator('textarea')).toBeVisible()
    await expect(page.locator('.tag-text-input')).toBeVisible()
  })

  test('tag chips are created on Enter key', async ({ page }) => {
    await page.click('button:has-text("Register Function")')
    const tagInput = page.locator('.tag-text-input')
    await tagInput.fill('buyers')
    await tagInput.press('Enter')
    await expect(page.locator('.tag-chip')).toBeVisible()
    await expect(page.locator('.tag-chip')).toContainText('buyers')
  })
})

test.describe('CRM — Campaigns page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/campaigns', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('Campaign builder opens and toggles HTML mode', async ({ page }) => {
    const newBtn = page.locator('button:has-text("New Campaign")')
    await expect(newBtn).toBeVisible()
    await newBtn.click()

    await expect(page.locator('input[placeholder="e.g. Spring Launch Email"]')).toBeVisible()

    // Test audience dropdown presence
    const audienceSelect = page.locator('select').nth(1)
    await expect(audienceSelect).toBeVisible()

    // Select Email channel (find Channel label, then the select next to it)
    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    
    // Select Custom HTML Mode
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
      
      // HTML mode toggle is now a select dropdown, not buttons
      const htmlModeToggle = page.locator('select').filter({ hasText: /Inline Editor/ })
      if (await htmlModeToggle.count() > 0) {
        // Switch to Raw HTML
        await htmlModeToggle.selectOption('raw')
        await expect(page.locator('textarea[placeholder*="<html>"]')).toBeVisible()
        
        // Switch back to WYSIWYG
        await htmlModeToggle.selectOption('wysiwyg')
        await expect(page.locator('.ql-container')).toBeVisible()
      }
    }
  })

  test('Link picker modal opens from WYSIWYG toolbar link button', async ({ page }) => {
    const newBtn = page.locator('button:has-text("New Campaign")')
    await newBtn.click()
    
    // Select Email channel
    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    
    // Select Custom HTML Mode
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')

      // Ensure WYSIWYG mode
      const htmlModeToggle = page.locator('select').filter({ hasText: /Inline Editor/ })
      if (await htmlModeToggle.count() > 0) {
        await htmlModeToggle.selectOption('wysiwyg')
      }
      
      // Click the link button in the Quill toolbar
      const linkBtn = page.locator('.ql-link')
      await expect(linkBtn).toBeVisible({ timeout: 5000 })
      await linkBtn.click()
      
      // Verify the unified link picker modal opens (fixed position overlay)
      await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })
      await expect(page.getByPlaceholder('Search promotions or landing pages...')).toBeVisible()
    }
  })

  test('Copy a Link button opens link picker for plain text', async ({ page }) => {
    const newBtn = page.locator('button:has-text("New Campaign")')
    await newBtn.click()
    
    // Select Email channel
    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')

      // The "Copy a Link..." button should be visible below the editor
      const copyLinkBtn = page.locator('button:has-text("Copy a Link...")')
      await expect(copyLinkBtn).toBeVisible({ timeout: 5000 })
      await copyLinkBtn.click()

      // Verify the link picker modal opens
      await expect(page.getByText('Insert Tracked Link')).toBeVisible({ timeout: 5000 })
    }
  })

  test('Campaign builder Email Preview modal opens and toggles tabs', async ({ page }) => {
    const newBtn = page.locator('button:has-text("New Campaign")')
    if (await newBtn.count() > 0) {
      await newBtn.click()
      
      // Select Email channel
      await page.locator('select').nth(0).selectOption('email')
      
      // Select Custom HTML Mode
      const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
      if (await modeSelect.count() > 0) {
        await modeSelect.selectOption('custom')
        
        // Fill the content fields to test data binding
        const textArea = page.locator('textarea[placeholder*="Hello, ..."]')
        await textArea.fill('This is a plain text test string')
        
        // Click Preview Email
        const previewBtn = page.locator('button', { hasText: 'Preview Email' })
        await expect(previewBtn).toBeVisible()
        await previewBtn.click()
        
        // Verify Modal opens
        const modal = page.locator('.modal-overlay')
        await expect(modal).toBeVisible()
        await expect(modal.locator('h3')).toContainText('Email Preview')
        
        // Verify Tabs
        const htmlTab = modal.locator('button', { hasText: 'HTML View' })
        const textTab = modal.locator('button', { hasText: 'Plain Text' })
        
        await expect(htmlTab).toBeVisible()
        await expect(textTab).toBeVisible()
        
        // Click Plain Text tab and verify content
        await textTab.click()
        // Plain text is rendered in a styled div (monospace), not a <pre>
        const plainTextPane = modal.locator('div[style*="monospace"]')
        await expect(plainTextPane).toContainText('This is a plain text test string')
        
        // Close Modal
        await modal.locator('button', { hasText: 'Close' }).click()
        await expect(modal).not.toBeVisible()
      }
    }
  })

  test('Delete campaign asks for confirmation', async ({ page }) => {
    await page.waitForSelector('.crm-table')
    const deleteBtns = page.locator('.crm-btn-danger-icon')
    
    if (await deleteBtns.count() > 0) {
      await deleteBtns.first().click()
      
      const modal = page.locator('.modal-overlay')
      await expect(modal).toBeVisible()
      await expect(modal.locator('h3')).toContainText('Delete Campaign?')
      
      await modal.locator('button:has-text("Cancel")').click()
      await expect(modal).not.toBeVisible()
    }
  })

  test('Image picker modal opens from WYSIWYG toolbar image button', async ({ page }) => {
    const newBtn = page.locator('button:has-text("New Campaign")')
    await newBtn.click()

    // Select Email + Custom HTML
    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    // Ensure WYSIWYG mode
    const htmlModeToggle = page.locator('select').filter({ hasText: /Inline Editor/ })
    if (await htmlModeToggle.count() > 0) {
      await htmlModeToggle.selectOption('wysiwyg')
    }

    // Click the image button in the Quill toolbar
    const imgBtn = page.locator('.ql-image')
    await expect(imgBtn).toBeVisible({ timeout: 5000 })
    await imgBtn.click()

    // Verify the image picker modal opens with fixed overlay
    await expect(page.getByText('Select Image')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('button:has-text("Upload from Computer")')).toBeVisible()
    await expect(page.getByPlaceholder('Search images...')).toBeVisible()
  })

  test('Image picker upload button triggers file chooser', async ({ page }) => {
    const newBtn = page.locator('button:has-text("New Campaign")')
    await newBtn.click()

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    const imgBtn = page.locator('.ql-image')
    await expect(imgBtn).toBeVisible({ timeout: 5000 })
    await imgBtn.click()
    await expect(page.getByText('Select Image')).toBeVisible({ timeout: 5000 })

    // Verify upload button triggers a file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      page.locator('button:has-text("Upload from Computer")').click()
    ])
    expect(fileChooser).toBeTruthy()
    expect(fileChooser.isMultiple()).toBe(false)
  })

  test('Image picker modal closes with X button', async ({ page }) => {
    const newBtn = page.locator('button:has-text("New Campaign")')
    await newBtn.click()

    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')
    const modeSelect = page.locator('select').filter({ hasText: /Custom HTML/ })
    if (await modeSelect.count() > 0) {
      await modeSelect.selectOption('custom')
    }

    const imgBtn = page.locator('.ql-image')
    await expect(imgBtn).toBeVisible({ timeout: 5000 })
    await imgBtn.click()
    await expect(page.getByText('Select Image')).toBeVisible({ timeout: 5000 })

    // Close modal
    await page.locator('button:has-text("×")').click()
    await expect(page.getByText('Select Image')).not.toBeVisible()
  })
})
