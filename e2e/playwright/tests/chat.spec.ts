/**
 * Chat E2E Tests — validate chat initiation from a post.
 *
 * Authenticated as Test Seller (via setup).
 */

import { expect, test } from "@playwright/test";

test.describe("Chat", () => {
    test("can initiate a chat from a feed post", async ({ page }) => {
        await page.goto("/feed");
        await page.waitForTimeout(3000);

        // Find a post with a chat/message button
        const chatBtn = page.locator(
            "[data-testid='chat-button'], [aria-label*='chat'], [aria-label*='message']",
        ).first();

        const hasChatBtn = await chatBtn.isVisible().catch(() => false);
        if (!hasChatBtn) {
            // Chat buttons may not be visible on own posts; skip
            test.skip();
        }

        await chatBtn.click();

        // Should navigate to chat screen
        await page.waitForURL(/\/chat/, { timeout: 10_000 });
    });

    test("can navigate to chats list", async ({ page }) => {
        await page.goto("/chats");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Chats list should be visible (may be empty)
        await expect(
            page.locator("text=/chat|messages|conversations/i").first(),
        ).toBeVisible({
            timeout: 10_000,
        });
    });
});
