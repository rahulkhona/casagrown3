import { test, expect } from '@playwright/test'

test.describe('Antigravity Creative Studio Suite — Photos & Pan-Zoom Videos', () => {
  test('tests prompt chat, photo candidate generation, sequence builder, pan & zoom motion video storyboard, and 60fps canvas player', async ({ page }) => {
    // 1. Navigate to Creative Studio
    await page.goto('/crm/creative-studio')
    await page.waitForLoadState('networkidle')

    // 2. Verify Studio Shell & Three Main Tabs
    await expect(page.locator('text=Creative AI Agent')).toBeVisible()
    await expect(page.locator('#tab-photos')).toBeVisible()
    await expect(page.locator('#tab-storyboard')).toBeVisible()
    await expect(page.locator('#tab-video')).toBeVisible()

    // 3. Verify Initial Empty State on Selection Board
    await expect(page.locator('text=Photo Candidates & Selection Board')).toBeVisible()
    await expect(page.locator('text=No Photos Generated Yet')).toBeVisible()

    // 4. Test Chat Prompt Submission
    const promptInput = page.locator('#chat-prompt-input')
    await promptInput.fill('Generate 4 photos of fresh ripe Meyer Lemons')
    await page.locator('#chat-send-btn').click()

    // Wait for agent reply & generated photo candidates (30s timeout for live AI network generation)
    await expect(page.locator('text=high-definition produce photos').first()).toBeVisible({ timeout: 30000 })
    await expect(page.locator('text=Meyer Lemons').first()).toBeVisible()

    // 5. Test Build Video from Selected Photos
    const btnBuildVideo = page.locator('button:has-text("Build Video with Selected Photos")')
    await expect(btnBuildVideo).toBeVisible()
    await btnBuildVideo.click()

    // 6. Verify Motion Storyboard / Sequence Builder Tab & Controls
    await expect(page.locator('text=Pan & Zoom Video Sequencer').first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('SCENE 1', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Text Overlay').first()).toBeVisible()

    // 7. Verify Live 60fps Motion Video Canvas Player Tab
    await page.locator('#tab-video').click()
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.locator('button:has-text("Export Video File")').first()).toBeVisible()
    await expect(page.locator('button:has-text("Save Video to Library")').first()).toBeVisible()
  })
})
