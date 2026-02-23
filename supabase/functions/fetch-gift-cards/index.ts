/**
 * fetch-gift-cards — Edge Function to fetch available gift card catalog
 *
 * Merges gift card catalogs from Reloadly and Tremendous,
 * deduplicates by brand (normalized name), and returns a unified list.
 * Each brand includes an `availableProviders` array so the redemption
 * function can pick the cheapest option at order time.
 *
 * Results are cached in platform_config for 24 hours.
 */

import { jsonOk, serveWithCors } from "../_shared/serve-with-cors.ts";
import { UnifiedGiftCard } from "../_shared/gift-card-types.ts";
import { fetchTremendousCatalog } from "../_shared/tremendous.ts";
import { fetchReloadlyCatalog } from "../_shared/reloadly.ts";

// ── Helpers ────────────────────────────────────────────────────────

/** Normalize brand name for dedup: lowercase, strip punctuation, country suffixes, trim */
function normalizeBrand(name: string): string {
    return name
        .toLowerCase()
        // Strip domain TLDs before punctuation removal (e.g. "Amazon.com" → "Amazon")
        .replace(/\.(com|co|net|org|io)$/i, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        // Strip common country / region suffixes that providers add
        .replace(
            /\s+(us|usa|united states|global|north america|na|international|intl|egift|e gift|gift card|giftcard)$/,
            "",
        )
        .trim();
}

/** Compute net fee for a given face value */
function computeNetFee(
    faceValue: number,
    discount: number,
    flatFee: number,
    pctFee: number,
): number {
    const discountSavings = faceValue * (discount / 100);
    const totalFee = flatFee + faceValue * (pctFee / 100);
    return Math.max(0, totalFee - discountSavings);
}

// ── Main Handler ───────────────────────────────────────────────────

serveWithCors(async (_req, { supabase, env, corsHeaders }) => {
    // ── Check cache first ──
    const { data: cached } = await supabase
        .from("platform_config")
        .select("value, updated_at")
        .eq("key", "gift_card_catalog_v4")
        .maybeSingle();

    if (cached) {
        const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
        const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

        if (cacheAge < CACHE_TTL) {
            const cards = JSON.parse(cached.value) as UnifiedGiftCard[];
            return jsonOk(
                { cards, cached: true, count: cards.length },
                corsHeaders,
            );
        }
    }

    // ── Fetch from both providers in parallel ──
    const brandMap = new Map<string, UnifiedGiftCard>();

    const tremendousKey = env("TREMENDOUS_API_KEY") || "";
    const reloadlyClient = env("RELOADLY_CLIENT_ID") || "";
    const reloadlySecret = env("RELOADLY_CLIENT_SECRET") || "";
    const isSandbox = env("RELOADLY_SANDBOX") !== "false";

    const [tremendousCards, reloadlyCards] = await Promise.allSettled([
        fetchTremendousCatalog(tremendousKey),
        fetchReloadlyCatalog(reloadlyClient, reloadlySecret, isSandbox),
    ]);

    // Process Tremendous first (preferred: free)
    if (tremendousCards.status === "fulfilled") {
        for (const card of tremendousCards.value) {
            const key = normalizeBrand(card.brandName);
            brandMap.set(key, {
                ...card,
                brandKey: key,
                id: `brand-${key.replace(/\s/g, "-")}`,
            });
        }
        console.log(
            `[CATALOG] Tremendous: ${tremendousCards.value.length} products`,
        );
    } else {
        console.error(
            "[CATALOG] Tremendous fetch failed:",
            tremendousCards.reason,
        );
    }

    // Process Reloadly — merge into existing brands or add new ones
    if (reloadlyCards.status === "fulfilled") {
        for (const card of reloadlyCards.value) {
            const key = normalizeBrand(card.brandName);
            const existing = brandMap.get(key);

            if (existing) {
                // Brand already exists from Tremendous — add Reloadly as an option
                existing.availableProviders.push(card.availableProviders[0]!);
                // Merge denominations
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
                // Use Reloadly logo if Tremendous didn't have one
                if (!existing.logoUrl && card.logoUrl) {
                    existing.logoUrl = card.logoUrl;
                }
            } else {
                // New brand only on Reloadly
                brandMap.set(key, {
                    ...card,
                    brandKey: key,
                    id: `brand-${key.replace(/\s/g, "-")}`,
                });
            }
        }
        console.log(
            `[CATALOG] Reloadly: ${reloadlyCards.value.length} products`,
        );
    } else {
        console.error("[CATALOG] Reloadly fetch failed:", reloadlyCards.reason);
    }

    // ── Compute display fields ──
    const cards: UnifiedGiftCard[] = [];
    for (const card of brandMap.values()) {
        // Sort providers: cheapest first (Tremendous always wins at $0)
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
        card.processingFeeUsd = Math.round(typicalFee * 100) / 100;

        cards.push(card);
    }

    // Sort by brand popularity (curated top brands first, then alphabetical)
    const POPULAR_BRANDS = new Map([
        ["amazon", 1],
        ["target", 2],
        ["walmart", 3],
        ["starbucks", 4],
        ["apple", 5],
        ["google play", 6],
        ["nike", 7],
        ["uber", 8],
        ["doordash", 9],
        ["grubhub", 10],
        ["netflix", 11],
        ["spotify", 12],
        ["home depot", 13],
        ["lowes", 14],
        ["best buy", 15],
        ["costco", 16],
        ["whole foods", 17],
        ["chipotle", 18],
        ["panera", 19],
        ["dunkin", 20],
        ["gap", 21],
        ["old navy", 22],
        ["nordstrom", 23],
        ["macys", 24],
        ["sephora", 25],
        ["ulta", 26],
        ["adidas", 27],
        ["under armour", 28],
        ["airbnb", 29],
        ["southwest", 30],
        ["delta", 31],
        ["lyft", 32],
        ["instacart", 33],
        ["gamestop", 34],
        ["playstation", 35],
        ["xbox", 36],
        ["steam", 37],
        ["roblox", 38],
        ["nintendo", 39],
        ["hulu", 40],
    ]);
    cards.sort((a, b) => {
        const aPriority = POPULAR_BRANDS.get(a.brandKey) ?? 999;
        const bPriority = POPULAR_BRANDS.get(b.brandKey) ?? 999;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.brandName.localeCompare(b.brandName);
    });

    console.log(
        `[CATALOG] Final: ${cards.length} unique brands`,
    );

    // ── Cache results ──
    if (cards.length > 0) {
        await supabase
            .from("platform_config")
            .upsert({
                // Note: Keep cache key sync'd when model changes!
                key: "gift_card_catalog_v4",
                value: JSON.stringify(cards),
                updated_at: new Date().toISOString(),
            }, { onConflict: "key" });
    }

    return jsonOk(
        { cards, cached: false, count: cards.length },
        corsHeaders,
    );
});
