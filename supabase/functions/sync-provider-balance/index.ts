/**
 * sync-provider-balance — Edge Function (Cron) for monitoring provider balances
 *
 * Polls Reloadly and Tremendous balance APIs, updates provider_accounts table.
 * Designed to be called by a Supabase cron job (pg_cron).
 *
 * If balance drops below threshold, logs a warning (future: send admin notification).
 */

import {
    jsonError,
    jsonOk,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

serveWithCors(async (_req, { supabase, env, corsHeaders }) => {
    const results: Record<string, { balance_cents: number; status: string }> =
        {};

    // ── Tremendous Balance ──
    const tremendousKey = env("TREMENDOUS_API_KEY");
    if (tremendousKey) {
        try {
            const res = await fetch(
                "https://testflight.tremendous.com/api/v2/funding_sources",
                {
                    headers: { "Authorization": `Bearer ${tremendousKey}` },
                },
            );

            if (res.ok) {
                const data = await res.json();
                // Find the balance funding source
                const balanceSource = data.funding_sources?.find(
                    (s: any) => s.method === "balance",
                );
                const balanceCents = Math.round(
                    balanceSource?.meta?.available_cents || 0,
                );

                await supabase
                    .from("provider_accounts")
                    .update({
                        balance_cents: balanceCents,
                        balance_updated_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("provider_name", "tremendous");

                results.tremendous = {
                    balance_cents: balanceCents,
                    status: "synced",
                };

                // Check threshold
                const { data: account } = await supabase
                    .from("provider_accounts")
                    .select("low_balance_threshold_cents")
                    .eq("provider_name", "tremendous")
                    .single();

                if (
                    account &&
                    balanceCents <
                        (account.low_balance_threshold_cents || 10000)
                ) {
                    console.warn(
                        `⚠️ Tremendous balance LOW: $${
                            (balanceCents / 100).toFixed(2)
                        }`,
                    );
                    // TODO: Send admin notification
                }
            } else {
                results.tremendous = { balance_cents: 0, status: "api_error" };
            }
        } catch (err) {
            console.error("Tremendous balance sync failed:", err);
            results.tremendous = { balance_cents: 0, status: "error" };
        }
    }

    // ── Reloadly Balance ──
    const reloadlyClientId = env("RELOADLY_CLIENT_ID");
    const reloadlySecret = env("RELOADLY_CLIENT_SECRET");
    if (reloadlyClientId && reloadlySecret) {
        try {
            // Auth
            const tokenRes = await fetch(
                "https://auth.reloadly.com/oauth/token",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        client_id: reloadlyClientId,
                        client_secret: reloadlySecret,
                        grant_type: "client_credentials",
                        audience: "https://giftcards-sandbox.reloadly.com",
                    }),
                },
            );

            if (tokenRes.ok) {
                const { access_token } = await tokenRes.json();

                const balanceRes = await fetch(
                    "https://giftcards-sandbox.reloadly.com/accounts/balance",
                    { headers: { "Authorization": `Bearer ${access_token}` } },
                );

                if (balanceRes.ok) {
                    const balanceData = await balanceRes.json();
                    const balanceCents = Math.round(
                        (balanceData.balance || 0) * 100,
                    );

                    await supabase
                        .from("provider_accounts")
                        .update({
                            balance_cents: balanceCents,
                            balance_updated_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        })
                        .eq("provider_name", "reloadly");

                    results.reloadly = {
                        balance_cents: balanceCents,
                        status: "synced",
                    };

                    // Check threshold
                    const { data: account } = await supabase
                        .from("provider_accounts")
                        .select("low_balance_threshold_cents")
                        .eq("provider_name", "reloadly")
                        .single();

                    if (
                        account &&
                        balanceCents <
                            (account.low_balance_threshold_cents || 10000)
                    ) {
                        console.warn(
                            `⚠️ Reloadly balance LOW: $${
                                (balanceCents / 100).toFixed(2)
                            }`,
                        );
                    }
                }
            }
        } catch (err) {
            console.error("Reloadly balance sync failed:", err);
            results.reloadly = { balance_cents: 0, status: "error" };
        }
    }

    return jsonOk({
        success: true,
        synced_at: new Date().toISOString(),
        providers: results,
    }, corsHeaders);
});
