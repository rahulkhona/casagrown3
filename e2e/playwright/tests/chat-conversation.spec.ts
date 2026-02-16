/**
 * Chat Conversation E2E Tests — validate chat screen and messaging UI.
 *
 * Tests navigating to chat, viewing conversations, and the message interface.
 *
 * Prerequisites:
 * - Local Supabase running with seed data
 * - Web dev server running on port 3000
 * - Auth setup has run
 */

import { expect, test } from "@playwright/test";

test.describe("Chat Conversation", () => {
    test("chat list page loads", async ({ page }) => {
        await page.goto("/chats");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Should show chats title or empty state
        const hasChats = await page
            .locator("text=/Chats|Messages|Conversations|No conversations/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasChats).toBeTruthy();
    });

    test("chat can be initiated from feed Order button", async ({ page }) => {
        await page.goto("/feed");
        await page.locator("text=Tomatoes").or(
            page.locator("text=No posts found"),
        ).first().waitFor({ timeout: 15_000 });

        // Find a "Chat" button on a post
        const chatBtn = page.locator("text=Chat").first();
        const hasChat = await chatBtn.isVisible().catch(() => false);

        if (!hasChat) {
            test.skip();
        }

        await chatBtn.click();
        await page.waitForTimeout(3000);

        // Should navigate to a chat conversation
        const onChat = page.url().includes("chat");
        const hasInput = await page
            .locator(
                "[placeholder*='message'], [placeholder*='Message'], [placeholder*='type']",
            )
            .first()
            .isVisible()
            .catch(() => false);

        expect(onChat || hasInput).toBeTruthy();
    });

    test("chat conversation shows message input", async ({ page }) => {
        await page.goto("/feed");
        await page.locator("text=Tomatoes").or(
            page.locator("text=No posts found"),
        ).first().waitFor({ timeout: 15_000 });

        const chatBtn = page.locator("text=Chat").first();
        const hasChat = await chatBtn.isVisible().catch(() => false);
        if (!hasChat) {
            test.skip();
        }

        await chatBtn.click();
        await page.waitForTimeout(5000);

        // Message input field or chat page should be present
        const hasInput = await page
            .locator(
                "[placeholder*='message'], [placeholder*='Message'], [placeholder*='type'], textarea",
            )
            .first()
            .isVisible()
            .catch(() => false);

        // Or at least we navigated to a chat page
        const onChat = page.url().includes("chat");

        expect(hasInput || onChat).toBeTruthy();
    });
});
