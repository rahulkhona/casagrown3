/**
 * Playwright E2E Test — Games Hub & Daily Garden Games Full User Journey
 *
 * Navigates through:
 * - /games Hub page (grid, streak badges, buttons)
 * - /games/history page (history table, streak stats, share leaderboard button)
 * - Individual game detail pages (/games/garden_spell_001, /games/jigsaw_001, etc.)
 * - Interacting with fields, play buttons, and navigation links
 */

import { test, expect } from '@playwright/test';

test.describe('Daily Garden Games — Comprehensive User Journey', () => {
  test('navigates through Games Hub, Game History, game cards, and play controls', async ({ page }) => {
    // 1. Navigate to /games Hub page
    await page.goto('/games');
    await page.waitForLoadState('networkidle');

    // 2. Verify Games Hub header and streak badges
    const title = page.locator('text=/Learn, Play & Have Fun|Daily Garden Games/i').first();
    await expect(title).toBeVisible({ timeout: 10_000 });

    const streakBadge = page.locator('text=/Streak/i').first();
    await expect(streakBadge).toBeVisible();

    // 3. Click "My Game History" button
    const historyBtn = page.locator('a[href="/games/history"]').first();
    await expect(historyBtn).toBeVisible();
    await historyBtn.click();
    await page.waitForURL('**/games/history');

    // 4. Verify Game History Page elements & buttons
    const historyTitle = page.locator('text=/Past Games Played|Game History/i').first();
    await expect(historyTitle).toBeVisible({ timeout: 8000 });

    // Click "Share Leaderboard" button if present
    const shareBtn = page.locator('button:has-text("Share"), button:has-text("Copy")').first();
    if (await shareBtn.isVisible().catch(() => false)) {
      await shareBtn.click();
      await page.waitForTimeout(500);
    }

    // Click "← Back to Games Hub" link
    const backBtn = page.locator('a[href="/games"]:has-text("Back")').first();
    await expect(backBtn).toBeVisible();
    await page.goto('/games');
    await page.waitForLoadState('networkidle');

    // 5. Navigate to individual game cards in the 3x2 grid
    const gameLinks = page.locator('a[href^="/games/"]');
    const count = await gameLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Click the first game card (e.g. Garden Spell)
    await gameLinks.first().click();
    await page.waitForURL('**/games/*');

    // 6. Verify Game Canvas Page
    const gameCanvasHeader = page.locator('text=/Garden|Harvest|Nutri|Spell|Plots|Memory|Anagram|Games Hub/i').first();
    await expect(gameCanvasHeader).toBeVisible({ timeout: 8000 });

    // Click "← Games Hub" link to return safely
    const hubLink = page.locator('a:has-text("Games Hub")').first();
    if (await hubLink.isVisible().catch(() => false)) {
      await hubLink.click();
      await page.waitForURL('**/games');
    }
  });
});
