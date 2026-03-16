/**
 * fetch-market-gift-cards — Edge Function for the Market app gift card catalog
 *
 * Same as fetch-gift-cards but with allowPrepaid=true so that
 * network-branded prepaid cards (Visa, Mastercard, Amex, Discover)
 * are included in the catalog.
 *
 * The community app continues to use fetch-gift-cards which blocks
 * all open-loop and prepaid cards.
 */

import { jsonOk, serveWithCors } from "../_shared/serve-with-cors.ts";
import { UnifiedGiftCard } from "../_shared/gift-card-types.ts";
import { fetchTremendousCatalog } from "../_shared/tremendous.ts";
import { fetchReloadlyCatalog } from "../_shared/reloadly.ts";




// ── Helpers (same as fetch-gift-cards) ─────────────────────────────
function normalizeBrand(name: string): string {
    return name
        .toLowerCase()
        .replace(/\.(com|co|net|org|io)$/i, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(
            /\s+(us|usa|united states|global|north america|na|international|intl|egift|e gift|gift card|giftcard)$/,
            "",
        )
        .trim();
}

function computeNetFee(
    faceValue: number,
    discount: number,
    flatFee: number,
    pctFee: number,
): number {
    const discountSavings = faceValue * (discount / 100);
    const totalFee = flatFee + faceValue * (pctFee / 100);
    return totalFee - discountSavings;
}

// ── POPULAR_BRANDS for sorting/enrichment ──────────────────────────
const POPULAR_BRANDS = new Map([
    ["amazon", { priority: 1, color: "#FF9900", icon: "📦" }],
    ["amazoncom", { priority: 1, color: "#FF9900", icon: "📦" }],
    ["target", { priority: 2, color: "#CC0000", icon: "🎯" }],
    ["walmart", { priority: 3, color: "#0071CE", icon: "🛒" }],
    ["starbucks", { priority: 4, color: "#00704A", icon: "☕" }],
    ["starbucksus", { priority: 4, color: "#00704A", icon: "☕" }],
    ["apple", { priority: 5, color: "#555555", icon: "🍎" }],
    ["visa", { priority: 6, color: "#1A1F71", icon: "💳" }],
    ["mastercard", { priority: 7, color: "#FF5F00", icon: "💳" }],
    ["amex", { priority: 7, color: "#2E77BB", icon: "💳" }],
    ["americanexpress", { priority: 7, color: "#2E77BB", icon: "💳" }],
    ["discover", { priority: 8, color: "#FF6000", icon: "💳" }],
    ["googleplay", { priority: 9, color: "#06C167", icon: "▶️" }],
    ["nike", { priority: 10, color: "#111111", icon: "👟" }],
    ["uber", { priority: 11, color: "#000000", icon: "🚗" }],
    ["doordash", { priority: 12, color: "#FF3008", icon: "🍔" }],
]);

// ── Main Handler ───────────────────────────────────────────────────

async function fetchMarketGiftCards(
    // deno-lint-ignore no-explicit-any
    supabase: any,
    env: (key: string) => string | undefined,
    isRefresh = false,
) {
    // ── 1. Fetch live active instruments ──
    const { data: activeInstruments } = await supabase
        .from("available_redemption_method_instruments")
        .select("instrument")
        .eq("is_active", true);

    const activeList = (activeInstruments || []).map(
        (i: { instrument: string }) => i.instrument,
    );

    // ── 2. Read path: serve from active cache (market-specific cache key) ──
    if (!isRefresh) {
        const { data: cached } = await supabase
            .from("giftcards_cache")
            .select("data, updated_at")
            .eq("provider", "unified_market")
            .eq("status", "active")
            .maybeSingle();

        if (cached?.data) {
            const rawCards = cached.data as UnifiedGiftCard[];
            const cards = rawCards
                .map((card) => {
                    card.availableProviders = card.availableProviders.filter(
                        (p) => activeList.includes(p.provider),
                    );
                    return card;
                })
                .filter((card) => card.availableProviders.length > 0);

            return { cards, cached: true, count: cards.length };
        }
    }

    // ── 3. Fetch from providers with allowPrepaid=true ──
    const brandMap = new Map<string, UnifiedGiftCard>();

    const tremendousKey = env("TREMENDOUS_API_KEY") || "";
    const reloadlyClient = env("RELOADLY_CLIENT_ID") || "";
    const reloadlySecret = env("RELOADLY_CLIENT_SECRET") || "";
    const isSandbox = env("RELOADLY_SANDBOX") !== "false";

    const fetchPromises: Promise<UnifiedGiftCard[]>[] = [];
    let tremendousPromiseIndex = -1;
    let reloadlyPromiseIndex = -1;

    if (activeList.includes("tremendous") && tremendousKey) {
        fetchPromises.push(fetchTremendousCatalog(tremendousKey, true)); // allowPrepaid = true
        tremendousPromiseIndex = fetchPromises.length - 1;
    }

    if (activeList.includes("reloadly") && reloadlyClient && reloadlySecret) {
        fetchPromises.push(
            fetchReloadlyCatalog(reloadlyClient, reloadlySecret, isSandbox, true), // allowPrepaid = true
        );
        reloadlyPromiseIndex = fetchPromises.length - 1;
    }

    const results = await Promise.allSettled(fetchPromises);

    const tremendousCards = tremendousPromiseIndex >= 0
        ? results[tremendousPromiseIndex]
        : {
            status: "rejected",
            reason: "provider disabled",
        } as PromiseRejectedResult;
    const reloadlyCards = reloadlyPromiseIndex >= 0
        ? results[reloadlyPromiseIndex]
        : {
            status: "rejected",
            reason: "provider disabled",
        } as PromiseRejectedResult;

    // Process Tremendous first
    if (tremendousCards && tremendousCards.status === "fulfilled") {
        for (const card of tremendousCards.value) {
            const key = normalizeBrand(card.brandName);
            brandMap.set(key, {
                ...card,
                brandKey: key,
                id: `brand-${key.replace(/\s/g, "-")}`,
            });
        }
        console.log(
            `[MARKET-CATALOG] Tremendous: ${tremendousCards.value.length} products`,
        );
    } else {
        console.error(
            "[MARKET-CATALOG] Tremendous fetch failed:",
            tremendousCards && tremendousCards.status === "rejected"
                ? tremendousCards.reason
                : "unknown",
        );
    }

    // Process Reloadly — merge
    if (reloadlyCards && reloadlyCards.status === "fulfilled") {
        for (const card of reloadlyCards.value) {
            const key = normalizeBrand(card.brandName);
            const existing = brandMap.get(key);

            if (existing) {
                existing.availableProviders.push(card.availableProviders[0]!);
                if (card.denominationType === "fixed") {
                    const existingDenoms = new Set(
                        existing.fixedDenominations,
                    );
                    for (const d of card.fixedDenominations) {
                        existingDenoms.add(d);
                    }
                    existing.fixedDenominations = [...existingDenoms].sort(
                        (a, b) => a - b,
                    );
                }
                existing.minDenomination = Math.min(
                    existing.minDenomination,
                    card.minDenomination,
                );
                existing.maxDenomination = Math.max(
                    existing.maxDenomination,
                    card.maxDenomination,
                );
                if (!existing.logoUrl && card.logoUrl) {
                    existing.logoUrl = card.logoUrl;
                }
            } else {
                brandMap.set(key, {
                    ...card,
                    brandKey: key,
                    id: `brand-${key.replace(/\s/g, "-")}`,
                });
            }
        }
        console.log(
            `[MARKET-CATALOG] Reloadly: ${reloadlyCards.value.length} products`,
        );
    } else {
        console.error(
            "[MARKET-CATALOG] Reloadly fetch failed:",
            reloadlyCards && reloadlyCards.status === "rejected"
                ? reloadlyCards.reason
                : "unknown",
        );
    }

    // ── Compute display fields ──
    const cards: UnifiedGiftCard[] = [];
    for (const card of brandMap.values()) {
        card.availableProviders.sort((a, b) => {
            const costA = computeNetFee(
                25,
                a.discountPercentage,
                a.feePerTransaction,
                a.feePercentage,
            );
            const costB = computeNetFee(
                25,
                b.discountPercentage,
                b.feePerTransaction,
                b.feePercentage,
            );
            return costA - costB;
        });

        const cheapest = card.availableProviders[0]!;
        const typicalFee = computeNetFee(
            25,
            cheapest.discountPercentage,
            cheapest.feePerTransaction,
            cheapest.feePercentage,
        );
        card.hasProcessingFee = typicalFee > 0;
        card.processingFeeUsd = Math.max(0, Math.round(typicalFee * 100) / 100);

        // Enrich with brand metadata
        const meta = POPULAR_BRANDS.get(card.brandKey);
        if (meta) {
            card.brandColor = meta.color;
            if (meta.icon) card.brandIcon = meta.icon;
        }

        cards.push(card);
    }

    cards.sort((a, b) => {
        const aMeta = POPULAR_BRANDS.get(a.brandKey);
        const bMeta = POPULAR_BRANDS.get(b.brandKey);
        const aPriority = aMeta?.priority ?? 999;
        const bPriority = bMeta?.priority ?? 999;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.brandName.localeCompare(b.brandName);
    });

    console.log(
        `[MARKET-CATALOG] Final: ${cards.length} unique brands (prepaid included)`,
    );

    // ── Cache results with market-specific key ──
    if (cards.length > 0) {
        if (isRefresh) {
            await supabase.from("giftcards_cache")
                .delete()
                .eq("provider", "unified_market")
                .eq("status", "building");

            await supabase.from("giftcards_cache").insert({
                provider: "unified_market",
                status: "building",
                data: cards,
                updated_at: new Date().toISOString(),
            });

            await supabase.from("giftcards_cache")
                .delete()
                .eq("provider", "unified_market")
                .eq("status", "active");

            await supabase.from("giftcards_cache")
                .update({ status: "active" })
                .eq("provider", "unified_market")
                .eq("status", "building");
        } else {
            await supabase.from("giftcards_cache").upsert({
                provider: "unified_market",
                status: "active",
                data: cards,
                updated_at: new Date().toISOString(),
            }, { onConflict: "provider,status" });
        }
    }

    return { cards, cached: false, count: cards.length };
}

if (import.meta.main) {
    serveWithCors(async (_req, { supabase, env, corsHeaders }) => {
        let isRefresh = false;
        try {
            const url = new URL(_req.url);
            isRefresh = url.searchParams.get("refresh") === "true";
        } catch { /* ignore */ }
        if (!isRefresh && _req.method === "POST") {
            try {
                const body = await _req.clone().json();
                isRefresh = body?.refresh === true;
            } catch { /* not JSON */ }
        }

        const result = await fetchMarketGiftCards(supabase, env, isRefresh);
        return jsonOk(result, corsHeaders);
    });
}
