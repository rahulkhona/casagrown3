import {
    jsonError,
    jsonOk,
    serveWithCors,
    requireAuth,
} from "../_shared/serve-with-cors.ts";
import { getStripeApiBase } from "../_shared/stripe.ts";

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
    // Feature flag: block onboarding when Stripe Connect is not enabled
    const connectEnabled = env("STRIPE_CONNECT_ENABLED");
    if (connectEnabled !== "true") {
        return jsonError("Stripe Connect is not enabled", corsHeaders, 403);
    }

    const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
        return jsonError("STRIPE_SECRET_KEY not configured", corsHeaders);
    }
    const STRIPE_API_BASE = getStripeApiBase();

    // 1. Authenticate user
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const userId = auth;

    console.log(`[STRIPE-CONNECT-ONBOARD] Onboarding requested by user ${userId}`);

    // 2. Fetch profile to see if stripe_connect_id already exists
    const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("stripe_connect_id")
        .eq("id", userId)
        .single();

    if (profileErr || !profile) {
        console.error("Failed to fetch user profile:", profileErr);
        return jsonError("User profile not found", corsHeaders);
    }

    let stripeConnectId = profile.stripe_connect_id;

    // 3. Create Stripe Standard Connect Account if they don't have one
    if (!stripeConnectId) {
        console.log(`[STRIPE-CONNECT-ONBOARD] Creating new Stripe Standard account for user ${userId}`);

        let newAccountId: string | null = null;
        try {
            const createResponse = await fetch(`${STRIPE_API_BASE}/v1/accounts`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    type: "standard",
                    "metadata[user_id]": userId,
                }),
            });

            const accountData = await createResponse.json();

            if (!createResponse.ok) {
                console.error("Stripe account creation failed:", accountData);
                return jsonError(
                    accountData?.error?.message || "Stripe account creation failed",
                    corsHeaders,
                );
            }

            newAccountId = accountData.id;

            // CRIT-4 FIX: Use a conditional update — only write if stripe_connect_id is still NULL.
            // This prevents a race condition where two simultaneous requests both create Stripe accounts.
            // If another request already wrote an account ID, this update matches 0 rows.
            const { data: updated, error: updateErr } = await supabase
                .from("profiles")
                .update({ stripe_connect_id: newAccountId })
                .eq("id", userId)
                .is("stripe_connect_id", null)  // Only applies if no ID is set yet
                .select("stripe_connect_id")
                .maybeSingle();

            if (updateErr) {
                // Unexpected DB error — clean up the Stripe account we just created
                console.error("Failed to save stripe_connect_id to profile:", updateErr);
                await deleteStripeAccount(STRIPE_SECRET_KEY, newAccountId);
                return jsonError("Failed to save Stripe credentials", corsHeaders);
            }

            if (!updated) {
                // Lost the race — another concurrent request already saved an account ID.
                // Delete the orphaned account we just created and use the winner's ID.
                console.warn(`[STRIPE-CONNECT-ONBOARD] Race condition detected for user ${userId}. Cleaning up orphaned account ${newAccountId}.`);
                await deleteStripeAccount(STRIPE_SECRET_KEY, newAccountId);

                // Re-fetch the winning account ID
                const { data: freshProfile } = await supabase
                    .from("profiles")
                    .select("stripe_connect_id")
                    .eq("id", userId)
                    .single();
                stripeConnectId = freshProfile?.stripe_connect_id ?? null;
                console.log(`[STRIPE-CONNECT-ONBOARD] Using existing account ${stripeConnectId} for user ${userId}`);
            } else {
                stripeConnectId = updated.stripe_connect_id;
                console.log(`[STRIPE-CONNECT-ONBOARD] Linked ${stripeConnectId} to user ${userId}`);
            }
        } catch (err) {
            // LOW-1 FIX: If any error occurs after Stripe account creation, clean up the orphan
            if (newAccountId) {
                console.warn(`[STRIPE-CONNECT-ONBOARD] Cleaning up orphaned Stripe account ${newAccountId} after error`);
                await deleteStripeAccount(STRIPE_SECRET_KEY, newAccountId);
            }
            console.error("Error creating Stripe account:", err);
            return jsonError("Error creating Stripe account", corsHeaders);
        }
    } else {
        console.log(`[STRIPE-CONNECT-ONBOARD] Found existing Stripe account ${stripeConnectId} for user ${userId}`);
    }

    if (!stripeConnectId) {
        return jsonError("Could not resolve a Stripe Connect account ID", corsHeaders);
    }

    // 4. Generate the Onboarding redirect URL
    try {
        console.log(`[STRIPE-CONNECT-ONBOARD] Generating onboarding link for ${stripeConnectId}`);
        const linkResponse = await fetch(`${STRIPE_API_BASE}/v1/account_links`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                account: stripeConnectId,
                refresh_url: `${siteUrl}/earnings/payout?stripe_err=refresh`,
                return_url: `${siteUrl}/earnings/payout/stripe-callback`,
                type: "account_onboarding",
            }),
        });

        const linkData = await linkResponse.json();

        if (!linkResponse.ok) {
            console.error("Stripe account link creation failed:", linkData);
            return jsonError(
                linkData?.error?.message || "Failed to generate onboarding link",
                corsHeaders,
            );
        }

        console.log(`[STRIPE-CONNECT-ONBOARD] Successfully generated onboarding link for ${userId}`);
        return jsonOk({ url: linkData.url }, corsHeaders);
    } catch (err) {
        console.error("Error creating Stripe account link:", err);
        return jsonError("Error generating onboarding link", corsHeaders);
    }
});

// ── Helper: Delete an orphaned Stripe account (best-effort, never throws) ────
async function deleteStripeAccount(stripeKey: string, accountId: string): Promise<void> {
    try {
        const res = await fetch(`${getStripeApiBase()}/v1/accounts/${accountId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${stripeKey}` },
        });
        if (res.ok) {
            console.log(`[STRIPE-CONNECT-ONBOARD] Deleted orphaned Stripe account ${accountId}`);
        } else {
            const body = await res.json().catch(() => ({}));
            console.warn(`[STRIPE-CONNECT-ONBOARD] Failed to delete orphaned account ${accountId}:`, body);
        }
    } catch (err) {
        console.warn(`[STRIPE-CONNECT-ONBOARD] Error deleting orphaned account ${accountId}:`, err);
    }
}
