import { test, expect } from './fixtures'

test.describe('App Download Prompts — Public Guest', () => {
  // Guest context: no cookies/auth
  test.use({ storageState: { cookies: [], origins: [] } })

  test('homepage displays download prompts on web browser', async ({ page }) => {
    await page.goto('/')

    // 1. Verify Safari Smart App Banner is present in the head
    const metaTag = page.locator('meta[name="apple-itunes-app"]')
    await expect(metaTag).toHaveAttribute('content', 'app-id=6774057094')

    // 2. Verify Hero section app download badges are visible
    const heroBadges = page.locator('div[class*="heroBadges"]').first()
    await expect(heroBadges).toBeVisible({ timeout: 10000 })
    await expect(heroBadges.getByText('download our mobile app', { exact: false })).toBeVisible()

    // 3. Verify App Store & Play Store links exist and have correct URLs
    const appStoreLink = heroBadges.locator('a[href*="apps.apple.com"]')
    await expect(appStoreLink).toHaveAttribute('href', 'https://apps.apple.com/app/id6774057094')

    const playStoreLink = heroBadges.locator('a[href*="play.google.com"]')
    await expect(playStoreLink).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.casagrown.market')
  })

  test('homepage hides download prompts inside the native app WebView wrapper', async ({ page }) => {
    // Inject the native bridge capability flag before the page loads
    await page.addInitScript(() => {
      (window as any).IS_NATIVE_APP = true
    })

    await page.goto('/')

    // 1. Verify Hero section app download badges are hidden
    const heroBadges = page.locator('div[class*="heroBadges"]').first()
    await expect(heroBadges).not.toBeVisible()

    // 2. Verify Footer app download badges are hidden
    const footerBadges = page.locator('div[class*="footerBadges"]').first()
    await expect(footerBadges).not.toBeVisible()
  })
})

test.describe('App Download Prompts — Authenticated Buyer', () => {
  // Uses the default auth storage state (user.json)

  test('order details page displays post-action download card on web', async ({ page }) => {
    // Go to orders list
    await page.goto('/orders')
    await page.waitForTimeout(2000)

    // Find any order card and click it to navigate to order details page
    const orderLink = page.locator('a[href*="/orders/"]').first()
    if (await orderLink.isVisible()) {
      await orderLink.click()
      await page.waitForTimeout(2000)

      // Verify the post-action download card is visible
      const downloadCard = page.locator('div[class*="downloadCard"]').first()
      await expect(downloadCard).toBeVisible({ timeout: 10000 })
      await expect(downloadCard.getByText('Track your order on the go!', { exact: false })).toBeVisible()

      // Verify App Store and Play Store links inside the card
      const appStoreLink = downloadCard.locator('a[href*="apps.apple.com"]')
      await expect(appStoreLink).toHaveAttribute('href', 'https://apps.apple.com/app/id6774057094')
    }
  })

  test('order details page hides post-action download card inside the native app WebView', async ({ page }) => {
    // Inject native app bridge flag
    await page.addInitScript(() => {
      (window as any).IS_NATIVE_APP = true
    })

    // Go to orders list
    await page.goto('/orders')
    await page.waitForTimeout(2000)

    const orderLink = page.locator('a[href*="/orders/"]').first()
    if (await orderLink.isVisible()) {
      await orderLink.click()
      await page.waitForTimeout(2000)

      // Verify download card is hidden
      const downloadCard = page.locator('div[class*="downloadCard"]').first()
      await expect(downloadCard).not.toBeVisible()
    }
  })
})

test.describe('Market Page Smart App Banner', () => {
  test('displays smart banner for iOS mobile web', async ({ page }) => {
    // 1. Mock iOS User Agent
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get() { return 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'; }
      });
    });

    await page.goto('/market')
    await page.waitForTimeout(1000)

    // Verify smart banner is visible
    const banner = page.locator('div[class*="appBanner"]').first()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner.getByText('Get our official app', { exact: false })).toBeVisible()

    // Verify GET button has App Store link and badge image
    const getBtn = banner.locator('a[href*="apps.apple.com"]')
    await expect(getBtn).toHaveAttribute('href', 'https://apps.apple.com/app/id6774057094')
    const badgeImg = getBtn.locator('img[alt="Download on the App Store"]')
    await expect(badgeImg).toBeVisible()
  })

  test('displays smart banner for Android mobile web', async ({ page }) => {
    // 1. Mock Android User Agent
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get() { return 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Mobile Safari/537.36'; }
      });
    });

    await page.goto('/market')
    await page.waitForTimeout(1000)

    // Verify smart banner is visible
    const banner = page.locator('div[class*="appBanner"]').first()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner.getByText('Get our official app', { exact: false })).toBeVisible()

    // Verify GET button has Google Play link and badge image
    const getBtn = banner.locator('a[href*="play.google.com"]')
    await expect(getBtn).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.casagrown.market')
    const badgeImg = getBtn.locator('img[alt="Get it on Google Play"]')
    await expect(badgeImg).toBeVisible()
  })


  test('hides smart banner on desktop web', async ({ page }) => {
    // Desktop UA (default)
    await page.goto('/market')
    await page.waitForTimeout(1000)

    // Verify smart banner is not visible
    const banner = page.locator('div[class*="appBanner"]').first()
    await expect(banner).not.toBeVisible()
  })

  test('hides smart banner inside native app WebView wrapper', async ({ page }) => {
    // 1. Mock iOS User Agent & native app flag
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get() { return 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'; }
      });
      (window as any).IS_NATIVE_APP = true
    });

    await page.goto('/market')
    await page.waitForTimeout(1000)

    // Verify smart banner is not visible
    const banner = page.locator('div[class*="appBanner"]').first()
    await expect(banner).not.toBeVisible()
  })

  test('hides smart banner when URL has native=true query param', async ({ page }) => {
    // 1. Mock iOS User Agent
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get() { return 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'; }
      });
    });

    await page.goto('/market?native=true')
    await page.waitForTimeout(1000)

    // Verify smart banner is not visible
    const banner = page.locator('div[class*="appBanner"]').first()
    await expect(banner).not.toBeVisible()
  })

  test('respects dismissal and stays hidden', async ({ page }) => {
    // 1. Mock iOS User Agent
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get() { return 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'; }
      });
    });

    await page.goto('/market')
    await page.waitForTimeout(1000)

    // Verify banner is visible
    const banner = page.locator('div[class*="appBanner"]').first()
    await expect(banner).toBeVisible()

    // Dismiss it
    const closeBtn = banner.locator('button[class*="appBannerClose"]')
    await closeBtn.click()

    // Verify it disappears immediately
    await expect(banner).not.toBeVisible()

    // Reload page and verify it remains hidden
    await page.reload()
    await page.waitForTimeout(1000)
    await expect(banner).not.toBeVisible()
  })
})

