/**
 * pick-best-provider.ts — Shared module for real-time provider comparison
 *
 * Called at redeem time to query both Tremendous and Reloadly single-product
 * APIs in parallel, recompute net fees with fresh data, and return the
 * cheapest available provider.
 *
 * Falls back to cached provider sort order if all real-time lookups fail.
 */

import { computeNetFee, ProviderOption } from "./gift-card-types.ts";
import { fetchTremendousProduct } from "./tremendous.ts";
import { fetchReloadlyProduct } from "./reloadly.ts";

export interface PickResult {
    provider: ProviderOption;
    netFeeCents: number;
    source: "realtime" | "cached";
}

/**
 * Pick the best (cheapest) provider for a given brand at redeem time.
 *
 * 1. For each cached provider, calls the single-product API in parallel
 * 2. Recomputes net fee with fresh discount/fee data
 * 3. Filters out unavailable providers (null returns)
 * 4. Returns cheapest by net fee
 * 5. Falls back to cached provider order on total failure
 */
export async function pickBestProvider(
    faceValueCents: number,
    cachedProviders: ProviderOption[],
    env: (key: string) => string | undefined,
): Promise<PickResult> {
    if (cachedProviders.length === 0) {
        throw new Error("No providers available for this brand");
    }

    // Fire real-time lookups in parallel
    const lookupPromises = cachedProviders.map(async (cached) => {
        try {
            let fresh: ProviderOption | null = null;

            if (cached.provider === "tremendous") {
                fresh = await fetchTremendousProduct(
                    env("TREMENDOUS_API_KEY") || "",
                    cached.productId,
                );
            } else if (cached.provider === "reloadly") {
                fresh = await fetchReloadlyProduct(
                    env("RELOADLY_CLIENT_ID") || "",
                    env("RELOADLY_CLIENT_SECRET") || "",
                    cached.productId,
                    env("RELOADLY_SANDBOX") !== "false",
                );
            }

            return fresh;
        } catch {
            return null;
        }
    });

    const results = await Promise.allSettled(lookupPromises);

    // Collect successful real-time results
    const realtimeOptions: ProviderOption[] = [];
    for (const result of results) {
        if (result.status === "fulfilled" && result.value !== null) {
            realtimeOptions.push(result.value);
        }
    }

    // If we got real-time data, use it
    if (realtimeOptions.length > 0) {
        realtimeOptions.sort((a, b) =>
            computeNetFee(faceValueCents, a) -
            computeNetFee(faceValueCents, b)
        );

        const best = realtimeOptions[0]!;
        return {
            provider: best,
            netFeeCents: Math.round(
                computeNetFee(faceValueCents, best) * 100,
            ),
            source: "realtime",
        };
    }

    // Fallback: use cached provider order (already sorted cheapest-first by fetch-gift-cards)
    console.warn(
        "[PICK-PROVIDER] All real-time lookups failed, using cached order",
    );
    const fallback = cachedProviders[0]!;
    return {
        provider: fallback,
        netFeeCents: Math.round(
            computeNetFee(faceValueCents, fallback) * 100,
        ),
        source: "cached",
    };
}
