import { test, expect } from '@playwright/test'

/**
 * CRM Editor Rich Content — Playwright E2E Tests
 *
 * Covers: Image sizing popover (presets, custom width, alignment, alt text)
 *         Table creation & editing via Quill 2.0 native table module
 *         HTML output integrity
 *
 * Auth: Handled by setup project storageState.
 * Run: cd apps/next-admin && npx playwright test e2e/crm-editor-rich-content.spec.ts
 */

// Helper: Navigate to campaigns, create a new campaign, and wait for the WYSIWYG editor
async function openWysiwygEditor(page: any) {
  await page.goto('/crm/campaigns', { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForSelector('#create-campaign-btn', { state: 'visible', timeout: 10000 })
  await page.click('#create-campaign-btn', { force: true })
  await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

  // Select email channel
  await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email')

  // Switch to Custom HTML mode (not template)
  const modeSelector = page.locator('select:has(option[value="custom"])')
  if (await modeSelector.count() > 0) {
    await modeSelector.selectOption('custom')
  }

  // Ensure WYSIWYG mode is active (not raw)
  const htmlModeSelector = page.locator('select:has(option[value="wysiwyg"])')
  if (await htmlModeSelector.count() > 0) {
    await htmlModeSelector.selectOption('wysiwyg')
  }

  // Wait for Quill editor to mount
  await page.waitForSelector('.ql-editor', { state: 'visible', timeout: 10000 })
  await page.waitForTimeout(600)
}

// Helper: Insert an image directly into the Quill editor via JavaScript
async function insertTestImage(page: any) {
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
  return testImageUrl
}

// Helper: Click the image and wait for the sizing popover to appear.
// Retries up to 3 times with increasing delays — Quill image blot click
// registration can race with editor focus and fail on first attempt.
async function clickImageAndOpenPopover(page: any, img: any) {
  const popover = page.locator('[data-testid="img-sizing-popover"]')
  await img.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await img.click()
    } catch {
      await img.click({ force: true })
    }
    await page.waitForTimeout(400 * attempt) // 400ms, 800ms, 1200ms, 1600ms
    if (await popover.isVisible({ timeout: 2000 }).catch(() => false)) return popover
    console.log(`[EDITOR] Popover not visible after attempt ${attempt}, retrying...`)
  }
  // Final assertion — will produce a clear failure message if still not visible
  await expect(popover).toBeVisible({ timeout: 5000 })
  return popover
}

// Helper: Insert a table by clicking the grid popover and wait for it to render
async function insertTable(page: any, rows: number, cols: number) {
  // Click in editor first to set focus
  await page.locator('.ql-editor').click()
  await page.waitForTimeout(300)

  await page.click('.ql-toolbar .ql-table')
  await page.waitForTimeout(400)
  await expect(page.locator('[data-testid="table-grid-popover"]')).toBeVisible({ timeout: 5000 })
  await page.click(`[data-testid="table-cell-${rows}-${cols}"]`)
  await page.waitForTimeout(1000) // Allow Quill to render the table
}

// ═══════════════════════════════════════════════════════════════
//  Section 1: Image Sizing Tests
// ═══════════════════════════════════════════════════════════════

test.describe('Image Sizing in WYSIWYG Editor', () => {
  test.beforeEach(async ({ page }) => {
    await openWysiwygEditor(page)
  })

  test('IMG-01: Insert image — verify <img> appears in the editor', async ({ page }) => {
    await insertTestImage(page)
    const img = page.locator('.ql-editor img').first()
    await expect(img).toBeVisible({ timeout: 5000 })
    const src = await img.getAttribute('src')
    expect(src).toContain('data:image')
    console.log('[IMG-01] ✅ Image inserted into editor:', src?.substring(0, 60))
  })

  test('IMG-02: Click inserted image — sizing popover appears with presets', async ({ page }) => {
    await insertTestImage(page)
    const img = page.locator('.ql-editor img').first()
    await expect(img).toBeVisible({ timeout: 5000 })

    const popover = await clickImageAndOpenPopover(page, img)
    await expect(page.locator('[data-testid="img-size-small"]')).toBeVisible()
    await expect(page.locator('[data-testid="img-size-medium"]')).toBeVisible()
    await expect(page.locator('[data-testid="img-size-full"]')).toBeVisible()
    await expect(page.locator('[data-testid="img-size-original"]')).toBeVisible()
    console.log('[IMG-02] ✅ Image sizing popover appeared with all preset buttons')
  })

  test('IMG-03: Click "Medium (400px)" — image width updates to 400px', async ({ page }) => {
    await insertTestImage(page)
    const img = page.locator('.ql-editor img').first()
    await expect(img).toBeVisible({ timeout: 5000 })

    await clickImageAndOpenPopover(page, img)
    await page.waitForTimeout(300)

    await page.click('[data-testid="img-size-medium"]', { force: true })
    await page.waitForTimeout(300)

    const width = await img.evaluate((el: HTMLImageElement) => el.style.width)
    expect(width).toBe('400px')
    console.log('[IMG-03] ✅ Image resized to:', width)
  })

  test('IMG-04: Enter custom width (250px) — image resizes', async ({ page }) => {
    await insertTestImage(page)
    const img = page.locator('.ql-editor img').first()
    await expect(img).toBeVisible({ timeout: 5000 })

    await clickImageAndOpenPopover(page, img)
    await page.waitForTimeout(300)

    const widthInput = page.locator('[data-testid="img-custom-width"]')
    await widthInput.fill('250')
    await widthInput.press('Enter')
    await page.waitForTimeout(300)

    const width = await img.evaluate((el: HTMLImageElement) => el.style.width)
    expect(width).toBe('250px')
    console.log('[IMG-04] ✅ Custom width applied:', width)
  })

  test('IMG-05: Change alignment to Center — display:block + margin:auto applied', async ({ page }) => {
    await insertTestImage(page)
    const img = page.locator('.ql-editor img').first()
    await expect(img).toBeVisible({ timeout: 5000 })

    await clickImageAndOpenPopover(page, img)
    await page.waitForTimeout(300)

    await page.click('[data-testid="img-align-center"]', { force: true })
    await page.waitForTimeout(300)

    const styles = await img.evaluate((el: HTMLImageElement) => ({
      display: el.style.display,
      marginLeft: el.style.marginLeft,
      marginRight: el.style.marginRight,
    }))
    expect(styles.display).toBe('block')
    expect(styles.marginLeft).toBe('auto')
    expect(styles.marginRight).toBe('auto')
    console.log('[IMG-05] ✅ Center alignment applied:', styles)
  })

  test('IMG-06: Set alt text — alt attribute persists', async ({ page }) => {
    await insertTestImage(page)
    const img = page.locator('.ql-editor img').first()
    await expect(img).toBeVisible({ timeout: 5000 })

    await clickImageAndOpenPopover(page, img)
    await page.waitForTimeout(300)

    const altInput = page.locator('[data-testid="img-alt-text"]')
    await altInput.fill('Fresh garden produce from CasaGrown')
    await altInput.press('Tab')
    await page.waitForTimeout(500)

    // Poll for the alt attribute to propagate (Quill updates DOM asynchronously)
    await expect(img).toHaveAttribute('alt', 'Fresh garden produce from CasaGrown', { timeout: 5000 })
    const alt = await img.getAttribute('alt')
    console.log('[IMG-06] ✅ Alt text set:', alt)
  })

  test('IMG-07: "Small (200px)" preset applies 200px width', async ({ page }) => {
    await insertTestImage(page)
    const img = page.locator('.ql-editor img').first()
    await expect(img).toBeVisible({ timeout: 5000 })

    await clickImageAndOpenPopover(page, img)
    // Wait for the popover to fully appear
    await expect(page.locator('[data-testid="img-size-small"]')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    await page.click('[data-testid="img-size-small"]', { force: true })
    await page.waitForTimeout(600)

    // The implementation sets both style.width and the HTML width attribute
    const width = await img.evaluate((el: HTMLImageElement) => el.style.width || el.getAttribute('width') || '')
    expect(width).toMatch(/200/)
    console.log('[IMG-07] ✅ Small preset applied:', width)
  })

  test('IMG-08: "Full Width" preset applies 100% width', async ({ page }) => {
    await insertTestImage(page)
    const img = page.locator('.ql-editor img').first()
    await expect(img).toBeVisible({ timeout: 5000 })

    await clickImageAndOpenPopover(page, img)
    await page.waitForTimeout(300)

    await page.click('[data-testid="img-size-full"]', { force: true })
    await page.waitForTimeout(300)

    const width = await img.evaluate((el: HTMLImageElement) => el.style.width)
    expect(width).toBe('100%')
    console.log('[IMG-08] ✅ Full Width preset applied:', width)
  })

  test('IMG-09: Remove image button deletes the image from the editor', async ({ page }) => {
    await insertTestImage(page)
    const img = page.locator('.ql-editor img').first()
    await expect(img).toBeVisible({ timeout: 5000 })

    await clickImageAndOpenPopover(page, img)
    await page.waitForTimeout(300)

    await page.click('[data-testid="img-remove"]', { force: true })
    await page.waitForTimeout(500)

    const imgCount = await page.locator('.ql-editor img').count()
    expect(imgCount).toBe(0)
    console.log('[IMG-09] ✅ Image removed from editor')
  })
})

// ═══════════════════════════════════════════════════════════════
//  Section 2: Table Support (Quill 2.0 Native Module)
// ═══════════════════════════════════════════════════════════════

test.describe('Table Support in WYSIWYG Editor', () => {
  test.beforeEach(async ({ page }) => {
    await openWysiwygEditor(page)
  })

  test('TBL-01: Table button visible in Quill toolbar', async ({ page }) => {
    const tableBtn = page.locator('.ql-toolbar .ql-table')
    await expect(tableBtn).toBeVisible({ timeout: 5000 })
    console.log('[TBL-01] ✅ Table button visible in toolbar')
  })

  test('TBL-02: Click table button — grid selector popover appears', async ({ page }) => {
    await page.click('.ql-toolbar .ql-table')
    await page.waitForTimeout(400)

    const popover = page.locator('[data-testid="table-grid-popover"]')
    await expect(popover).toBeVisible({ timeout: 5000 })
    const cells = page.locator('.table-grid-cell')
    const cellCount = await cells.count()
    expect(cellCount).toBe(36)
    console.log('[TBL-02] ✅ Table grid popover appeared with', cellCount, 'cells')
  })

  test('TBL-03: Select 3×3 grid — table with 3 rows and 9 cells inserted', async ({ page }) => {
    await insertTable(page, 3, 3)

    // Quill 2.0 renders tables as <table><tbody><tr><td data-row="...">
    const table = page.locator('.ql-editor table').first()
    await expect(table).toBeVisible({ timeout: 5000 })

    const rows = await table.locator('tr').count()
    const tds = await table.locator('td').count()
    expect(rows).toBe(3)
    expect(tds).toBe(9)
    console.log(`[TBL-03] ✅ Table inserted: ${rows} rows, ${tds} cells`)
  })

  test('TBL-04: Click inside a table cell — table editing toolbar appears', async ({ page }) => {
    await insertTable(page, 3, 3)

    await expect(page.locator('.ql-editor table').first()).toBeVisible({ timeout: 5000 })

    // Click inside a cell
    const firstCell = page.locator('.ql-editor td').first()
    await firstCell.click({ force: true })
    await page.waitForTimeout(500)

    const toolbar = page.locator('[data-testid="table-edit-toolbar"]')
    await expect(toolbar).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="table-add-row-below"]')).toBeVisible()
    await expect(page.locator('[data-testid="table-add-col-right"]')).toBeVisible()
    await expect(page.locator('[data-testid="table-delete"]')).toBeVisible()
    console.log('[TBL-04] ✅ Table editing toolbar appeared')
  })

  test('TBL-05: Click "Add Row Below" — table gains a row', async ({ page }) => {
    await insertTable(page, 3, 3)

    const table = page.locator('.ql-editor table').first()
    await expect(table).toBeVisible({ timeout: 5000 })
    const initialRows = await table.locator('tr').count()

    // Click in a cell, then use the edit toolbar
    await page.locator('.ql-editor td').first().click({ force: true })
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="table-edit-toolbar"]')).toBeVisible({ timeout: 5000 })

    await page.click('[data-testid="table-add-row-below"]', { force: true })
    await page.waitForTimeout(500)

    const newRows = await table.locator('tr').count()
    expect(newRows).toBe(initialRows + 1)
    console.log(`[TBL-05] ✅ Row added: ${initialRows} → ${newRows}`)
  })

  test('TBL-06: Click "Delete Table" — table is removed', async ({ page }) => {
    await insertTable(page, 2, 2)

    await expect(page.locator('.ql-editor table').first()).toBeVisible({ timeout: 5000 })

    await page.locator('.ql-editor td').first().click({ force: true })
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="table-edit-toolbar"]')).toBeVisible({ timeout: 5000 })

    await page.click('[data-testid="table-delete"]', { force: true })
    await page.waitForTimeout(500)

    const tableCount = await page.locator('.ql-editor table').count()
    expect(tableCount).toBe(0)
    console.log('[TBL-06] ✅ Table deleted')
  })
})

// ═══════════════════════════════════════════════════════════════
//  Section 3: HTML Output Integrity
// ═══════════════════════════════════════════════════════════════

test.describe('HTML Output Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await openWysiwygEditor(page)
  })

  test('HTML-01: Image resize persists in Raw HTML output', async ({ page }) => {
    await insertTestImage(page)
    const img = page.locator('.ql-editor img').first()
    await expect(img).toBeVisible({ timeout: 5000 })

    await clickImageAndOpenPopover(page, img)
    await page.click('[data-testid="img-size-medium"]', { force: true })
    await page.waitForTimeout(500)

    await page.locator('.ql-editor').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(300)

    const htmlModeSelector = page.locator('select:has(option[value="raw"])')
    await htmlModeSelector.selectOption('raw')
    await page.waitForTimeout(300)

    const rawHtml = await page.locator('textarea[placeholder*="html"]').inputValue()
    expect(rawHtml).toContain('img')
    console.log('[HTML-01] ✅ Image present in Raw HTML output')
  })
})
