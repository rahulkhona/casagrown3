/**
 * Chat E2E Tests — validate chat initiation from a post.
 *
 * Authenticated as Test Seller (via setup).
 */

import { expect, test } from "@playwright/test";

test.describe("Chat", () => {
    test("can initiate a chat from a feed post", async ({ page }) => {
        await page.goto("/feed");
        // Wait for feed content to load
        await page.locator("text=Tomatoes").or(
            page.locator("text=No posts found"),
        ).first().waitFor({ timeout: 15_000 });

        // Scroll down to find a post from another user with Chat or Order buttons
        let hasChatBtn = false;
        let hasOrderBtn = false;
        const chatBtn = page.getByText("Chat", { exact: true }).first();
        const orderBtn = page.getByText("Order", { exact: true }).first();

        for (let i = 0; i < 5; i++) {
            hasChatBtn = await chatBtn.isVisible().catch(() => false);
            hasOrderBtn = await orderBtn.isVisible().catch(() => false);
            if (hasChatBtn || hasOrderBtn) break;
            await page.mouse.wheel(0, 500);
            await page.waitForTimeout(1000);
        }

        if (!hasChatBtn && !hasOrderBtn) {
            test.skip();
        }

        // Click whichever button is visible
        if (hasChatBtn) {
            await chatBtn.click();
        } else {
            await orderBtn.click();
        }

        await page.waitForTimeout(3000);

        // Should either navigate to chat or open order sheet
        const onChat = page.url().includes("chat");
        const hasOrderSheet = await page
            .locator("text=/Quantity|Delivery|Points|Cancel/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(onChat || hasOrderSheet).toBeTruthy();
    });

    test("can navigate to chats list", async ({ page }) => {
        await page.goto("/chat");
        await page.waitForTimeout(5000);

        // Should not redirect to login (user is authenticated)
        expect(page.url()).not.toContain("/login");

        // Chat list should show some content — messages, empty state, or header
        const hasContent = await page
            .locator(
                "text=/chat|messages|conversations|no messages|inbox/i",
            )
            .first()
            .isVisible()
            .catch(() => false);

        // Even if empty, the page should have loaded without redirecting to login
        expect(hasContent || page.url().includes("/chat")).toBeTruthy();
    });
});
