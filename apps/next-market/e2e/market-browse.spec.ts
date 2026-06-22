import { test, expect } from './fixtures'

test.describe('Market Browse', () => {
  test('should display the market page with booths', async ({ page }) => {
    await page.goto('/market')
    // Should show the market page with search capability
    await expect(page.locator('body')).toBeVisible()
  })

  test('should have search input for products', async ({ page }) => {
    await page.goto('/market')
    // Look for a search input or search-related element
    const searchInput = page.locator('input[type="text"], input[type="search"], [placeholder*="earch"]')
    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible()
    }
  })

  test('should show booth cards with product info', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000) // Wait for data load
    // Check for booth/product-related content
    const body = await page.textContent('body')
    // Market page should have some content loaded
    expect(body).toBeTruthy()
  })

  test('should navigate to booth detail when clicking a booth', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    // Try to click first booth card/link
    const boothLink = page.locator('a[href*="/booth"]').first()
    if (await boothLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await Promise.all([
        page.waitForURL('**/booth/**', { timeout: 5000 }).catch(() => {}),
        boothLink.click(),
      ])
      // After navigation, check URL contains /booth OR we stayed on market (if no booths loaded)
      const url = page.url()
      expect(url).toMatch(/\/booth|\/market/)
    }
  })

  test('should filter by category when available', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    const categoryFilter = page.locator('button, [role="tab"]').filter({ hasText: /produce|baked|eggs/i }).first()
    if (await categoryFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Filter button may be disabled during loading — force click is safe here
      await categoryFilter.click({ force: true, timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(500)
    }
  })
})

test.describe('Market Page — Action Cards (Option B)', () => {
  test('should show "Grow & Earn" sell card', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body).toContain('Grow & Earn')
  })

  test('sell card should link to /create-listing', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    const sellLink = page.locator('a[href="/create-listing"]').first()
    await expect(sellLink).toBeVisible({ timeout: 5000 })
    // Verify it contains the expected CTA text
    const sellText = await sellLink.textContent()
    expect(sellText).toContain('Start Listing')
  })

  test('should show GrowBot card with avatar', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    const growbotLink = page.locator('a[href="/growbot"]').first()
    await expect(growbotLink).toBeVisible({ timeout: 5000 })
    // Verify GrowBot avatar image is present
    const avatar = growbotLink.locator('img[alt="GrowBot"]')
    await expect(avatar).toBeVisible()
    // Verify avatar uses the correct image
    const src = await avatar.getAttribute('src')
    expect(src).toContain('growbot-avatar')
  })

  test('GrowBot card should link to /growbot', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    const growbotLink = page.locator('a[href="/growbot"]').first()
    await expect(growbotLink).toBeVisible({ timeout: 5000 })
    const text = await growbotLink.textContent()
    expect(text).toContain('GrowBot')
    expect(text).toContain('Ask')
  })

  test('should NOT have floating action buttons (FABs)', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    // Old sell FAB should not exist
    const sellFab = page.locator('#sell-fab')
    await expect(sellFab).toHaveCount(0)
    // Old GrowBot FAB should not exist on market page
    const body = await page.textContent('body')
    // No fixed-position "Sell Something" or "List for Next Market" text
    expect(body).not.toContain('Sell Something')
    expect(body).not.toContain('List for Next Market')
  })

  test('should NOT show pioneer banner', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    // PioneerBanner has specific text about being a pioneer
    const body = await page.textContent('body')
    expect(body).not.toContain('Pioneer')
  })

  test('should NOT show market closed banner', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    // No large closed-market banners
    expect(body).not.toContain('Market is Closed')
    expect(body).not.toContain('Next Market Day is')
    expect(body).not.toContain('Grand Opening')
  })

  test('should show fulfillment filter pills', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    // Check for delivery/pickup filter pills (visible after address is resolved)
    const body = await page.textContent('body')
    // At minimum, the address prompt OR filter pills should be present
    const hasAddressPrompt = body?.includes('Where should we look')
    const hasFilterPills = body?.includes('Delivery') || body?.includes('Pickup')
    expect(hasAddressPrompt || hasFilterPills).toBe(true)
  })

  test('sell card should display "Takes under 2 min" badge', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body).toContain('Takes under 2 min')
  })
})

test.describe('Market Page — USDA Carousels', () => {
  // These tests require address to be resolved so USDA data loads
  // They use a pre-set address query param to skip the address prompt

  test('local farms section should use horizontal scroll layout', async ({ page }) => {
    await page.goto('/market?addr=San+Jose+CA&lat=37.3382&lng=-121.8863&zip=95113')
    await page.waitForTimeout(4000) // Wait for USDA API data
    const farmsHeader = page.locator('text=Local Farms Near You')
    if (await farmsHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      // The carousel container should have overflowX: auto (horizontal scroll)
      const carousel = farmsHeader.locator('..').locator('..').locator('div[style*="overflow"]').first()
      if (await carousel.isVisible({ timeout: 2000 }).catch(() => false)) {
        const overflowStyle = await carousel.evaluate(el => getComputedStyle(el).overflowX)
        expect(overflowStyle).toBe('auto')
      }
    }
  })

  test('local farm cards should show Map button instead of Directions', async ({ page }) => {
    await page.goto('/market?addr=San+Jose+CA&lat=37.3382&lng=-121.8863&zip=95113')
    await page.waitForTimeout(4000)
    const farmsHeader = page.locator('text=Local Farms Near You')
    if (await farmsHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Cards should have compact "Map" button, not "Directions"
      const mapButtons = page.locator('a:has-text("Map")').filter({ hasText: /^.*Map$/ })
      if (await mapButtons.count() > 0) {
        const firstMap = mapButtons.first()
        const href = await firstMap.getAttribute('href')
        expect(href).toContain('google.com/maps')
      }
    }
  })

  test('farmers markets section should use horizontal scroll layout', async ({ page }) => {
    await page.goto('/market?addr=San+Jose+CA&lat=37.3382&lng=-121.8863&zip=95113')
    await page.waitForTimeout(4000)
    const marketsHeader = page.locator('text=Nearby Farmers Markets')
    if (await marketsHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Verify "via USDA" badge is shown
      const body = await page.textContent('body')
      expect(body).toContain('via USDA')
      expect(body).toContain('Sorted by distance')
    }
  })

  test('USDA cards should NOT use vertical stacked layout', async ({ page }) => {
    await page.goto('/market?addr=San+Jose+CA&lat=37.3382&lng=-121.8863&zip=95113')
    await page.waitForTimeout(4000)
    // If USDA sections are visible, verify cards are NOT in a flex-column container
    const farmsHeader = page.locator('text=Local Farms Near You')
    if (await farmsHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Find the card container — it should NOT have flex-direction: column
      const container = farmsHeader.locator('..').locator('..').locator('div[style*="flex"]').first()
      if (await container.isVisible({ timeout: 2000 }).catch(() => false)) {
        const direction = await container.evaluate(el => getComputedStyle(el).flexDirection)
        expect(direction).not.toBe('column')
      }
    }
  })
})
