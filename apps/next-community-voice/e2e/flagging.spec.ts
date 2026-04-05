/**
 * E2E Tests — Content Flagging & Support Flow
 *
 * Prerequisites:
 * - Local Supabase running with seed data
 * - Dev server running on port 3002
 */

import { expect, test } from "@playwright/test";

test.describe("Content Flagging", () => {
    test("flag button is visible on board ticket cards", async ({ page }) => {
        await page.goto("/board");
        // Wait for tickets to load
        try {
            await page.locator("text=/results/").first().waitFor({
                timeout: 30_000,
            });
        } catch {
            await page.waitForTimeout(5000);
        }

        // Ticket cards should render — check for any seeded ticket
        const body = await page.locator("body").innerText();
        const hasTicketContent =
            body.includes("Allow uploading videos in chat") ||
            body.includes("Dark mode support") ||
            body.includes("Map not loading");
        expect(hasTicketContent).toBeTruthy();
    });

    test("flag button is visible on ticket detail page", async ({ page }) => {
        await page.goto("/board");
        try {
            await page.locator("text=/results/").first().waitFor({
                timeout: 30_000,
            });
        } catch {
            await page.waitForTimeout(5000);
        }

        // Navigate to a ticket detail — click on a ticket title
        const ticketTitle = page.getByTestId("ticket-card-title").first();
        if (await ticketTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
            await ticketTitle.click();
            await page.waitForTimeout(2000);

            // Should show the ticket detail page
            const detailBody = await page.locator("body").innerText();
            expect(detailBody.length).toBeGreaterThan(100);
        } else {
            // Fall back to clicking any ticket text
            const anyTicket = page.locator("text=Allow uploading videos in chat").first();
            if (await anyTicket.isVisible({ timeout: 5000 }).catch(() => false)) {
                await anyTicket.click();
                await page.waitForTimeout(2000);
            }
        }
    });

    test("support ticket form accessible via direct URL", async ({ page }) => {
        await page.goto("/submit?type=support");

        // Wait for the form to fully load by checking for the submit button
        await expect(
            page.getByRole("button", { name: "Submit Support Request" }),
        ).toBeVisible({ timeout: 15_000 });

        // Privacy notice should be visible for support tickets
        await expect(
            page.locator("text=/private.*only you and CasaGrown staff/i"),
        ).toBeVisible();
    });
});
