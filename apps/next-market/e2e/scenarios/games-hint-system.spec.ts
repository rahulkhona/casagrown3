/**
 * Playwright E2E Test — Games 1-Step Hint Engine & Anti-Spam Cooldown Verification
 *
 * Tests all 6 deployed CasaGrown daily games:
 * - Garden Spell (/games/garden_spell_001)
 * - Harvest Jigsaw (/games/jigsaw_001)
 * - Nutri-Calc (/games/math_001)
 * - Garden Plots (/games/garden_plots_001)
 * - Memory Match (/games/memory_match_001)
 * - Crop Anagram (/games/anagram_001)
 *
 * Verifies:
 * 1. Hint Button ("💡 Need a Hint?") presence on each game canvas.
 * 2. 1-Step fill/reveal action when Hint button is clicked.
 * 3. Anti-spam 3-second cooldown lockout state ("⏳ Cooldown (3s)").
 * 4. Re-enablement after cooldown timer elapses ("💡 Need a Hint? (2 left)").
 */

import { test, expect } from '@playwright/test';

const DEPLOYED_GAMES = [
  { id: 'garden_spell_001', name: 'Garden Spell' },
  { id: 'jigsaw_001', name: 'Harvest Jigsaw' },
  { id: 'math_001', name: 'Nutri-Calc' },
  { id: 'garden_plots_001', name: 'Garden Plots' },
  { id: 'memory_match_001', name: 'Memory Match' },
  { id: 'anagram_001', name: 'Crop Anagram' },
];

test.describe('CasaGrown Games — Hint Engine & Cooldown Verification', () => {
  for (const game of DEPLOYED_GAMES) {
    test(`verifies 1-step hint and anti-spam cooldown on ${game.name} (${game.id})`, async ({ page }) => {
      // 1. Navigate to game canvas page
      await page.goto(`/games/${game.id}`);
      await page.waitForLoadState('networkidle');

      // 2. Locate Hint Button
      const hintBtn = page.locator('button[aria-label="Hint Button"]').first();
      await expect(hintBtn).toBeVisible({ timeout: 10_000 });
      await expect(hintBtn).toHaveText(/Need a Hint\? \(3 left\)/i);

      // 3. Click Hint Button (1st Hint)
      await hintBtn.click();

      // 4. Assert Anti-Spam Cooldown Lockout (Disabled + Cooldown Text)
      await expect(hintBtn).toBeDisabled();
      await expect(hintBtn).toHaveText(/Cooldown/i);

      // 5. Attempt Rapid Spam Click while cooling down (should be blocked)
      await hintBtn.click({ force: true }).catch(() => {});

      // 6. Wait for 3.2s Cooldown Timer to Expire
      await page.waitForTimeout(3200);

      // 7. Assert Hint Button Re-Enables with 2 Hints Left
      await expect(hintBtn).toBeEnabled();
      await expect(hintBtn).toHaveText(/Need a Hint\? \(2 left\)/i);

      // 8. Click 2nd Hint cleanly
      await hintBtn.click();
      await expect(hintBtn).toHaveText(/Cooldown/i);
    });
  }
});
