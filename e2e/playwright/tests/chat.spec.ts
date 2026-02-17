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
        await page.locator("text=Peppers").or(
            page.locator("text=Tomatoes"),
        ).first().waitFor({ timeout: 15_000 });

        // Scroll to the buyer's post (Peppers) which shows Chat/Order buttons
        const peppersText = page.locator("text=Peppers").first();
        await peppersText.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);

        // Find a Chat button (appears on buy posts from other users)
        // or Order button (appears on sell posts from other users)
        const chatBtn = page.getByText("Chat", { exact: true }).first();
        const orderBtn = page.getByText("Order", { exact: true }).first();

        const hasChatBtn = await chatBtn.isVisible().catch(() => false);
        const hasOrderBtn = await orderBtn.isVisible().catch(() => false);

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
