import { test, expect } from '@playwright/test'

/**
 * CRM Editor AI Assistant — Playwright E2E Tests
 *
 * Covers: Opening the AI Assistant modal.
 *         Showing context revision warning if current editor content is not empty.
 *         Generating content (mocked).
 *         Applying drafts (replace/append) and verifying raw HTML mode toggle.
 *
 * Auth: Handled by setup project storageState.
 * Run: cd apps/next-admin && npx playwright test e2e/crm-editor-ai-assistant.spec.ts
 */

async function openCampaignEditor(page: any) {
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
}

test.describe('CRM Campaign Editor AI Draft Assistant', () => {
  test('AI-01: Open AI Assistant without content — verify warning notice is NOT visible, generate & apply replace', async ({ page }) => {
    await openCampaignEditor(page)

    // Ensure WYSIWYG mode is active
    const htmlModeSelector = page.locator('select:has(option[value="wysiwyg"])')
    await htmlModeSelector.selectOption('wysiwyg')
    await page.waitForSelector('.ql-editor', { state: 'visible', timeout: 10000 })

    // Check that Quill editor is empty
    const editorContent = await page.locator('.ql-editor').innerHTML()
    expect(editorContent).toContain('<p><br></p>') // empty quill editor default

    // Open AI modal
    await page.click('button:has-text("Ask AI")')
    await expect(page.locator('h3:has-text("AI Draft Assistant")')).toBeVisible({ timeout: 5000 })

    // Warning notice should NOT be visible
    await expect(page.locator('text=The assistant will use your current editor content as context')).not.toBeVisible()

    // Fill prompt and generate
    await page.fill('textarea[placeholder*=" tomatoes"]', 'Write a friendly newsletter about tomatoes')
    await page.click('button:has-text("Generate Draft")')

    // Wait for the mock generation to complete
    await expect(page.locator('button:has-text("Replace All")')).toBeVisible({ timeout: 30000 })

    // Apply replacement
    await page.click('button:has-text("Replace All")')

    // Verify modal closes
    await expect(page.locator('h3:has-text("AI Draft Assistant")')).not.toBeVisible()

    // Verify HTML Mode toggles to Raw HTML
    await expect(htmlModeSelector).toHaveValue('raw')

    // Verify content is updated in textarea (contains mock email content)
    const textareaValue = await page.locator('textarea[placeholder*="html"]').inputValue()
    expect(textareaValue).toContain('Welcome to CasaGrown!')
    expect(textareaValue).toContain('mock AI response')
    console.log('[AI-01] ✅ Successfully generated and replaced content in raw HTML mode')
  })

  test('AI-02: Open AI Assistant with content — verify warning notice is visible, generate revision & apply append', async ({ page }) => {
    await openCampaignEditor(page)

    // Ensure Raw HTML mode is active to input initial content directly
    const htmlModeSelector = page.locator('select:has(option[value="raw"])')
    await htmlModeSelector.selectOption('raw')
    const textarea = page.locator('textarea[placeholder*="html"]')
    await textarea.fill('<h1>Initial campaign header</h1>')

    // Open AI modal
    await page.click('button:has-text("Ask AI")')
    await expect(page.locator('h3:has-text("AI Draft Assistant")')).toBeVisible({ timeout: 5000 })

    // Warning notice MUST be visible
    await expect(page.locator('text=The assistant will use your current editor content as context')).toBeVisible()

    // Fill prompt and generate revision
    await page.fill('textarea[placeholder*=" tomatoes"]', 'Translate to Spanish')
    await page.click('button:has-text("Generate Draft")')

    // Wait for mock revision to complete
    await expect(page.locator('button:has-text("Replace All")')).toBeVisible({ timeout: 30000 })

    // Apply append
    await page.click('button:has-text("Append")')

    // Verify modal closes
    await expect(page.locator('h3:has-text("AI Draft Assistant")')).not.toBeVisible()

    // Verify HTML Mode remains raw (or switches to raw)
    await expect(htmlModeSelector).toHaveValue('raw')

    // Verify content is appended in textarea
    const textareaValue = await page.locator('textarea[placeholder*="html"]').inputValue()
    expect(textareaValue).toContain('<h1>Initial campaign header</h1>')
    expect(textareaValue).toContain('Revised Email!')
    expect(textareaValue).toContain('Initial campaign header') // present in revised context block
    console.log('[AI-02] ✅ Successfully verified revision context banner and appended revised content')
  })

  test('AI-03: Open AI Assistant for Plain Text Fallback — verify HTML content is used as context, generate & apply plain text conversion', async ({ page }) => {
    await openCampaignEditor(page)

    // Fill the HTML editor first in Raw HTML mode
    const htmlModeSelector = page.locator('select:has(option[value="raw"])')
    await htmlModeSelector.selectOption('raw')
    const htmlTextarea = page.locator('textarea[placeholder*="html"]')
    await htmlTextarea.fill('<h1>Beautiful Summer Tomatoes</h1><p>Visit: https://casagrown.com</p>')

    // Locate the Plain Text Fallback Ask AI button and click it
    const plainTextAiButton = page.locator('div:has(> label:has-text("Plain Text Fallback")) button:has-text("Ask AI")')
    await plainTextAiButton.click()

    await expect(page.locator('h3:has-text("AI Draft Assistant")')).toBeVisible({ timeout: 5000 })

    // Verify custom context notice message is visible
    await expect(page.locator('text=The assistant will use your HTML editor content as context to generate a matching plain text version')).toBeVisible()

    // The prompt textarea should be prefilled
    const promptTextarea = page.locator('textarea[placeholder*=" tomatoes"]')
    await expect(promptTextarea).toHaveValue('Convert the HTML campaign to a clean plain text version, ensuring all text, links, and details are preserved.')

    // Click generate
    await page.click('button:has-text("Generate Draft")')

    // Wait for the mock generation to complete
    await expect(page.locator('button:has-text("Replace All")')).toBeVisible({ timeout: 30000 })

    // Apply replace
    await page.click('button:has-text("Replace All")')

    // Verify modal closes
    await expect(page.locator('h3:has-text("AI Draft Assistant")')).not.toBeVisible()

    // Verify that the HTML editor content remains unchanged
    const htmlValue = await htmlTextarea.inputValue()
    expect(htmlValue).toContain('<h1>Beautiful Summer Tomatoes</h1>')

    // Verify that the Plain Text Fallback textarea now contains the mock plain text content
    const plainTextarea = page.locator('textarea[placeholder*="Hello, ..."]')
    const plainTextValue = await plainTextarea.inputValue()
    expect(plainTextValue).toContain('[MOCK PLAIN TEXT FALLBACK]')
    expect(plainTextValue).toContain('Beautiful Summer Tomatoes')
    console.log('[AI-03] ✅ Successfully converted HTML content to plain text fallback via AI')
  })
})
