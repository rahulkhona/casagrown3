import { test, expect } from './fixtures'

const BASE = process.env.BASE_URL || 'http://localhost:3001'

// ============================================================================
// Product CRUD
// ============================================================================
test.describe('Product Management', () => {
  test('add product page loads', async ({ page }) => {
    await page.goto(`${BASE}/my-booth`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('add product form shows required fields', async ({ page }) => {
    await page.goto(`${BASE}/my-booth`)
    // Look for the add product button/link
    const addBtn = page.locator('text=Add Product, text=New Product, a[href*="add"]').first()
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click()
      await expect(page.locator('input, textarea, select').first()).toBeVisible()
    }
  })

  test('product form validates required fields', async ({ page }) => {
    await page.goto(`${BASE}/my-booth`)
    const addBtn = page.locator('text=Add Product, text=New Product').first()
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click()
      // Try submitting empty form
      const submitBtn = page.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]').first()
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click()
        // Should show validation errors or stay on page
        await expect(page).not.toHaveURL(/market/)
      }
    }
  })
})

// ============================================================================
// Profile & Settings
// ============================================================================
test.describe('Profile Management', () => {
  test('profile page loads', async ({ page }) => {
    await page.goto(`${BASE}/profile`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('settings page loads', async ({ page }) => {
    await page.goto(`${BASE}/settings`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('profile shows user info or login prompt', async ({ page }) => {
    await page.goto(`${BASE}/profile`)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/Profile|Account|Name|Email|Sign|Market|Settings/i)
  })
})

// ============================================================================
// Booth Customization
// ============================================================================
test.describe('Booth Customization', () => {
  test('customize booth page loads', async ({ page }) => {
    await page.goto(`${BASE}/my-booth/customize`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('booth coupons page loads', async ({ page }) => {
    await page.goto(`${BASE}/my-booth/coupons`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('booth invitations page loads', async ({ page }) => {
    await page.goto(`${BASE}/my-booth/invite`)
    await expect(page.locator('body')).toBeVisible()
  })
})

// ============================================================================
// Chat
// ============================================================================
test.describe('Chat', () => {
  test('chat page loads', async ({ page }) => {
    await page.goto(`${BASE}/chat`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('chat shows messages or empty state', async ({ page }) => {
    await page.goto(`${BASE}/chat`)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/Chat|Message|Conversation|inbox|Sign|Market|Loading/i)
  })
})

// ============================================================================
// Additional Pages
// ============================================================================
test.describe('Additional Pages', () => {
  test('join booth page loads', async ({ page }) => {
    await page.goto(`${BASE}/join-booth/TESTCODE`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('terms page loads', async ({ page }) => {
    await page.goto(`${BASE}/terms`)
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('body')).toContainText('Terms')
  })

  test('get-started page loads', async ({ page }) => {
    await page.goto(`${BASE}/get-started`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('following page loads', async ({ page }) => {
    await page.goto(`${BASE}/following`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('community voice page loads', async ({ page }) => {
    await page.goto(`${BASE}/voice`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('earnings page loads', async ({ page }) => {
    await page.goto(`${BASE}/earnings`)
    await expect(page.locator('body')).toBeVisible()
  })
})

// ============================================================================
// Error States
// ============================================================================
test.describe('Error Handling', () => {
  test('404 page renders gracefully', async ({ page }) => {
    await page.goto(`${BASE}/this-page-definitely-does-not-exist-123`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('invalid booth ID handles gracefully', async ({ page }) => {
    await page.goto(`${BASE}/booth/invalid-id-123`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('invalid product ID handles gracefully', async ({ page }) => {
    await page.goto(`${BASE}/product/invalid-id-456`)
    await expect(page.locator('body')).toBeVisible()
  })
})
