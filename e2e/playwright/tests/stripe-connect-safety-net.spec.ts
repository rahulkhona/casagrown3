import { expect, test } from "@playwright/test";

/**
 * Stripe Connect Safety Net — Playwright E2E Tests
 *
 * G3: Failed/recovered transfer banners on payout page
 * G4: Stripe Connect onboarding state rendering
 * G5: Activity feed renders stripe_transfer_reversed entries
 * G6: Connect deactivation shows wallet mode
 */

test.describe("Stripe Connect Safety Net UI", () => {

    // ========================================================================
    // G3a: Failed transfer warning banner with Fix button
    // ========================================================================
    test("G3a: Failed transfer warning banner shows with Fix button", async ({ page }) => {
        // Mock the user_settlements query for failed transfer check
        await page.route("**/rest/v1/user_settlements*", async (route) => {
            const url = route.request().url();
            if (url.includes("status=in")) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        id: "test-failed-id",
                        net_payout_usd: 90.0,
                        stripe_transfer_error: "account_closed",
                        status: "stripe_transfer_failed",
                    }),
                });
            } else {
                await route.continue();
            }
        });

        // Mock other RPCs the payout page calls on mount
        await page.route("**/rest/v1/rpc/get_auto_redemption_config*", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        });
        await page.route("**/rest/v1/rpc/get_payout_status*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ verified: false, handle: null, handle_type: null }),
            });
        });
        await page.route("**/rest/v1/rpc/get_active_redemption_providers*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify([{ method: "cashout", is_active: true, instruments: [] }]),
            });
        });

        await page.goto("/earnings/payout");
        await page.waitForTimeout(1500);
        if (page.url().includes("/login")) { test.skip(); }

        // Verify the warning banner renders
        await expect(page.getByText("Direct Transfer Failed")).toBeVisible();
        await expect(page.getByText("$90.00").first()).toBeVisible();
        await expect(page.getByText("Fix in Stripe Onboarding")).toBeVisible();
    });

    // ========================================================================
    // G3b: Wallet-restored informational banner (green)
    // ========================================================================
    test("G3b: Wallet-restored banner shows recovery message without Fix button", async ({ page }) => {
        await page.route("**/rest/v1/user_settlements*", async (route) => {
            const url = route.request().url();
            if (url.includes("status=in")) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        id: "test-restored-id",
                        net_payout_usd: 72.0,
                        stripe_transfer_error: "bank_account_restricted",
                        status: "wallet_fallback",
                    }),
                });
            } else {
                await route.continue();
            }
        });

        await page.route("**/rest/v1/rpc/get_auto_redemption_config*", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        });
        await page.route("**/rest/v1/rpc/get_payout_status*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ verified: false, handle: null, handle_type: null }),
            });
        });
        await page.route("**/rest/v1/rpc/get_active_redemption_providers*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify([{ method: "cashout", is_active: true, instruments: [] }]),
            });
        });

        await page.goto("/earnings/payout");
        await page.waitForTimeout(1500);
        if (page.url().includes("/login")) { test.skip(); }

        // Should show recovery title, not failure
        await expect(page.getByText("Direct Transfer Recovered")).toBeVisible();
        // The Fix button should NOT be visible for recovered transfers
        await expect(page.getByText("Fix in Stripe Onboarding")).toHaveCount(0);
        // Should mention wallet restore
        await expect(page.getByText(/restored to your wallet/i).first()).toBeVisible();
    });

    // ========================================================================
    // G4a: Pre-onboarding state — "Not Connected" + Connect button
    // ========================================================================
    test("G4a: Pre-onboarding shows Not Connected with Connect Stripe button", async ({ page }) => {
        // Mock profile to return no Stripe Connect
        await page.route("**/rest/v1/profiles*", async (route) => {
            const url = route.request().url();
            if (url.includes("stripe_connect")) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        stripe_connect_id: null,
                        stripe_onboarding_completed: false,
                        stripe_connect_active: false,
                    }),
                });
            } else {
                await route.continue();
            }
        });

        await page.route("**/rest/v1/user_settlements*", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        });
        await page.route("**/rest/v1/rpc/get_auto_redemption_config*", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        });
        await page.route("**/rest/v1/rpc/get_payout_status*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ verified: false, handle: null, handle_type: null }),
            });
        });
        await page.route("**/rest/v1/rpc/get_active_redemption_providers*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify([{ method: "cashout", is_active: true, instruments: [] }]),
            });
        });

        await page.goto("/earnings/payout");
        await page.waitForTimeout(1500);
        if (page.url().includes("/login")) { test.skip(); }

        // Click the Direct Payout card
        await page.getByText("Direct Payout (Stripe)").click();
        await page.waitForTimeout(500);

        // Should show unlinked state
        await expect(page.getByText("Not Connected")).toBeVisible();
        await expect(page.getByText("Connect Stripe")).toBeVisible();
    });

    // ========================================================================
    // G4b: Post-onboarding state — "Connected & Active"
    // ========================================================================
    test("G4b: Post-onboarding shows Connected & Active with dashboard link", async ({ page }) => {
        // Mock profile as fully onboarded
        await page.route("**/rest/v1/profiles*", async (route) => {
            const url = route.request().url();
            if (url.includes("stripe_connect")) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        stripe_connect_id: "acct_test_1234",
                        stripe_onboarding_completed: true,
                        stripe_connect_active: true,
                    }),
                });
            } else {
                await route.continue();
            }
        });

        await page.route("**/rest/v1/user_settlements*", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        });
        await page.route("**/rest/v1/rpc/get_auto_redemption_config*", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        });
        await page.route("**/rest/v1/rpc/get_payout_status*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ verified: true, handle: "test@example.com", handle_type: "email" }),
            });
        });
        await page.route("**/rest/v1/rpc/get_active_redemption_providers*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify([{ method: "cashout", is_active: true, instruments: [] }]),
            });
        });

        await page.goto("/earnings/payout");
        await page.waitForTimeout(1500);
        if (page.url().includes("/login")) { test.skip(); }

        // Click the Direct Payout card — should already show "Active" badge
        await expect(page.getByText("⚡ Active").first()).toBeVisible();
        await page.getByText("Direct Payout (Stripe)").click();
        await page.waitForTimeout(500);

        // Should show connected state
        await expect(page.getByText("✓ Connected & Active")).toBeVisible();
        await expect(page.getByText("Direct Payouts Active")).toBeVisible();
        await expect(page.getByText("View Stripe Dashboard ↗")).toBeVisible();
    });

    // ========================================================================
    // G5: Activity feed renders stripe_transfer_reversed entries
    // ========================================================================
    test("G5: Activity feed shows transfer-reversed entry with ↩️ icon", async ({ page }) => {
        // Mock transaction log to include a stripe_transfer_reversed entry
        await page.route("**/rest/v1/rpc/get_transaction_log*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([
                    {
                        tx_id: "ledger-test-reversed-1",
                        tx_type: "stripe_transfer_reversed",
                        tx_date: "2026-05-21T00:00:00Z",
                        description: "Direct deposit failed — funds restored to wallet",
                        amount: 90.0,
                        direction: "credit",
                        status: "completed",
                        counterparty: null,
                        metadata: {},
                    },
                    {
                        tx_id: "sale-test-1",
                        tx_type: "sale",
                        tx_date: "2026-05-20T00:00:00Z",
                        description: "Tomatoes × 2",
                        amount: 20.0,
                        direction: "credit",
                        status: "completed",
                        counterparty: "Test Buyer",
                        metadata: {},
                    },
                ]),
            });
        });

        await page.route("**/rest/v1/rpc/get_transaction_summary*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    available_usd: 90.0,
                    processing_payouts_usd: 0,
                    total_sales: 110.0,
                    pending_usd: 0,
                    held_balance_usd: 0,
                    total_earned_usd: 110,
                    total_spent_usd: 0,
                    total_withdrawn_usd: 0,
                    total_purchases: 0,
                    purchase_count: 0,
                    sales_count: 1,
                    total_fees: 11,
                    total_redeemed: 0,
                    total_cc_charged: 0,
                    refunds_received: 0,
                    refunds_issued: 0,
                    net_earnings: 99,
                    unsettled_sales_usd: 0,
                    unsettled_purchases_usd: 0,
                    unsettled_order_count: 0,
                }),
            });
        });

        await page.route("**/rest/v1/rpc/get_user_credit_balance*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ purchase_credits_usd: 0, platform_fee_credits_usd: 0, total_credits_usd: 0 }),
            });
        });

        await page.goto("/earnings");
        await page.waitForTimeout(1500);
        if (page.url().includes("/login")) { test.skip(); }

        // The reversal entry should be visible with its description
        await expect(page.getByText("funds restored to wallet").first()).toBeVisible();
        // The ↩️ icon should render (it's in TX_ICONS for stripe_transfer_reversed)
        await expect(page.getByText("↩️").first()).toBeVisible();
        // Amount should show
        await expect(page.getByText("$90.00").first()).toBeVisible();
    });

    // ========================================================================
    // G6: Connect deactivation shows wallet options
    // ========================================================================
    test("G6: Deactivated Connect shows wallet payout options only", async ({ page }) => {
        // Mock profile as deactivated (post-deauthorization)
        await page.route("**/rest/v1/profiles*", async (route) => {
            const url = route.request().url();
            if (url.includes("stripe_connect")) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        stripe_connect_id: "acct_deactivated_123",
                        stripe_onboarding_completed: false,
                        stripe_connect_active: false,
                    }),
                });
            } else {
                await route.continue();
            }
        });

        await page.route("**/rest/v1/user_settlements*", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        });
        await page.route("**/rest/v1/rpc/get_auto_redemption_config*", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        });
        await page.route("**/rest/v1/rpc/get_payout_status*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ verified: false, handle: null, handle_type: null }),
            });
        });
        await page.route("**/rest/v1/rpc/get_active_redemption_providers*", async (route) => {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify([
                    { method: "cashout", is_active: true, instruments: [{ instrument: "paypal", is_active: true }] },
                ]),
            });
        });

        await page.goto("/earnings/payout");
        await page.waitForTimeout(1500);
        if (page.url().includes("/login")) { test.skip(); }

        // The "⚡ Active" badge should NOT be visible (Connect is deactivated)
        await expect(page.getByText("⚡ Active")).toHaveCount(0);

        // All three payout method cards should be visible
        await expect(page.getByText("Direct Payout (Stripe)")).toBeVisible();
        await expect(page.getByText("Manual Wallet")).toBeVisible();
        await expect(page.getByText("Auto Wallet")).toBeVisible();

        // Click Direct Payout — should show "Not Connected" since deauthorized
        await page.getByText("Direct Payout (Stripe)").click();
        await page.waitForTimeout(500);
        await expect(page.getByText("Not Connected")).toBeVisible();
        await expect(page.getByText("Connect Stripe")).toBeVisible();
    });
});
