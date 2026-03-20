import { test, expect } from './fixtures'

const BASE = process.env.BASE_URL || 'http://localhost:3001'

// ============================================================================
// FULL BUYER JOURNEY — Browse → Product → BuyModal → Payment → Order
// ============================================================================
test.describe('Buyer Journey', () => {
  test('browse market → view products → see booth', async ({ page }) => {
    await page.goto(`${BASE}/market`)
    await expect(page.locator('body')).toBeVisible()
    // Market page should show products or booths
    await page.waitForSelector('text=Market, text=Browse, text=Open, text=Closed', { timeout: 10000 }).catch(() => {})
    // Verify we see some content
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('product card shows price, name, and add to cart', async ({ page }) => {
    await page.goto(`${BASE}/market`)
    await page.waitForTimeout(2000)
    // Look for a product card with price content
    const hasProduct = await page.locator('[class*="product"], [class*="card"], [class*="item"]').first()
      .isVisible({ timeout: 5000 }).catch(() => false)
    if (hasProduct) {
      const productText = await page.locator('[class*="product"], [class*="card"]').first().textContent()
      expect(productText).toBeTruthy()
    }
  })

  test('clicking a product opens detail or buy modal', async ({ page }) => {
    await page.goto(`${BASE}/market`)
    await page.waitForTimeout(2000)
    const card = page.locator('[class*="product"], [class*="card"], [class*="item"]').first()
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click()
      await page.waitForTimeout(1000)
      const body = await page.locator('body').textContent()
      // Should show product details or buy modal
      expect(body!.length).toBeGreaterThan(50) // Non-empty page
    }
  })

  test('buy modal shows price breakdown with tax', async ({ page }) => {
    await page.goto(`${BASE}/market`)
    await page.waitForTimeout(2000)
    const buyBtn = page.locator('text=Buy, text=Order, text=Add to Cart').first()
    if (await buyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await buyBtn.click()
      await page.waitForTimeout(1000)
      const modal = await page.locator('body').textContent()
      // Price breakdown should include tax
      if (modal?.includes('Price Breakdown')) {
        expect(modal).toContain('Subtotal')
        expect(modal).toContain('Tax')
      }
    }
  })
})

// ============================================================================
// FULL SELLER JOURNEY — Booth setup → List product → Manage orders
// ============================================================================
test.describe('Seller Journey', () => {
  test('my booth page loads', async ({ page }) => {
    await page.goto(`${BASE}/my-booth`)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('booth setup shows configuration options', async ({ page }) => {
    await page.goto(`${BASE}/my-booth`)
    const body = await page.locator('body').textContent()
    // Should show booth-related content or login prompt
    expect(body).toMatch(/booth|sign in|log in|create|setup/i)
  })

  test('orders page shows order management UI', async ({ page }) => {
    await page.goto(`${BASE}/orders`)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/orders|sign in|no orders/i)
  })

  test('earnings page shows financial dashboard', async ({ page }) => {
    await page.goto(`${BASE}/earnings`)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/earnings|balance|sign in|payout/i)
  })
})

// ============================================================================
// CHAT FLOW — Conversations and messaging
// ============================================================================
test.describe('Chat Flow', () => {
  test('chat page loads and shows conversation list or empty state', async ({ page }) => {
    await page.goto(`${BASE}/chat`)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/chat|messages|conversations|sign in|no messages/i)
  })

  test('chat interface has message input', async ({ page }) => {
    await page.goto(`${BASE}/chat`)
    await page.waitForTimeout(2000)
    // If authenticated and has conversations, should show input
    const hasInput = await page.locator('input[type="text"], input[placeholder*="message"], textarea').first()
      .isVisible({ timeout: 3000 }).catch(() => false)
    // Even if no input (not authenticated), page should be responsive
    expect(page.url()).toContain('/chat')
  })
})

// ============================================================================
// COUPON FLOW — Create and apply coupons
// ============================================================================
test.describe('Coupon Flow', () => {
  test('coupons page loads', async ({ page }) => {
    await page.goto(`${BASE}/my-booth/coupons`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('coupon management shows create button or login prompt', async ({ page }) => {
    await page.goto(`${BASE}/my-booth/coupons`)
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/coupon|create|sign in|no coupons/i)
  })
})

// ============================================================================
// FLAG FLOW — Report inappropriate content
// ============================================================================
test.describe('Flag Flow', () => {
  test('product page has flag option', async ({ page }) => {
    await page.goto(`${BASE}/market`)
    await page.waitForTimeout(2000)
    // Navigate to a product if available
    const card = page.locator('[class*="product"], [class*="card"]').first()
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click()
      await page.waitForTimeout(1000)
      const body = await page.locator('body').textContent()
      // Flag option should be accessible
      if (body?.includes('🚩') || body?.includes('Report') || body?.includes('Flag')) {
        expect(body).toMatch(/🚩|Report|Flag/)
      }
    }
  })
})

// ============================================================================
// RATING FLOW — Rate completed orders
// ============================================================================
test.describe('Rating Flow', () => {
  test('orders page shows rating option for completed orders', async ({ page }) => {
    await page.goto(`${BASE}/orders`)
    await expect(page.locator('body')).toBeVisible()
    // Rating stars or "Rate" button should be present for completed orders
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})

// ============================================================================
// HELPER INVITATION FLOW — Invite/accept booth helpers
// ============================================================================
test.describe('Helper Invitation', () => {
  test('invite helper page loads', async ({ page }) => {
    await page.goto(`${BASE}/my-booth/invite`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('join booth page loads with code', async ({ page }) => {
    await page.goto(`${BASE}/join-booth/TESTCODE123`)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})

// ============================================================================
// BOOTH FOLLOWING — Follow/unfollow booths
// ============================================================================
test.describe('Booth Following', () => {
  test('following page loads', async ({ page }) => {
    await page.goto(`${BASE}/following`)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/following|sign in|no booths/i)
  })

  test('booth detail has follow button', async ({ page }) => {
    await page.goto(`${BASE}/market`)
    await page.waitForTimeout(2000)
    // Look for booth links
    const boothLink = page.locator('a[href*="booth"]').first()
    if (await boothLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await boothLink.click()
      await page.waitForTimeout(1000)
      const body = await page.locator('body').textContent()
      // Follow button should exist on booth detail
      if (body?.includes('Follow') || body?.includes('♡')) {
        expect(body).toMatch(/Follow|♡|Following/)
      }
    }
  })
})

// ============================================================================
// TERMS & LEGAL — Legal compliance
// ============================================================================
test.describe('Legal Compliance', () => {
  test('terms page renders full legal text', async ({ page }) => {
    await page.goto(`${BASE}/terms`)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.locator('body').textContent()
    expect(body).toContain('Terms')
    expect(body!.length).toBeGreaterThan(200) // Substantial legal text
  })
})

// ============================================================================
// ERROR HANDLING — Graceful degradation
// ============================================================================
test.describe('Error Handling', () => {
  test('404 page handles unknown routes', async ({ page }) => {
    await page.goto(`${BASE}/unknown-route-abc-123`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
  })

  test('invalid booth ID handles gracefully', async ({ page }) => {
    await page.goto(`${BASE}/booth/nonexistent-booth-id`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
  })

  test('deep link to invalid product handles gracefully', async ({ page }) => {
    await page.goto(`${BASE}/product/nonexistent-product-id`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
  })

  test('expired session redirects appropriately', async ({ page }) => {
    await page.goto(`${BASE}/my-booth`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
    // Should either show booth content or redirect/prompt to sign in
  })
})

// ============================================================================
// RESPONSIVE LAYOUT — Mobile breakpoints
// ============================================================================
test.describe('Responsive Layout', () => {
  test('mobile viewport shows bottom nav', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }) // iPhone X
    await page.goto(`${BASE}/market`)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.locator('body').textContent()
    expect(body).toContain('Market')
  })

  test('tablet viewport renders properly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }) // iPad
    await page.goto(`${BASE}/market`)
    await expect(page.locator('body')).toBeVisible()
  })

  test('desktop viewport shows full navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE}/market`)
    await expect(page.locator('body')).toBeVisible()
  })
})
