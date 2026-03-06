/**
 * fetch-gift-cards — Edge Function to fetch available gift card catalog
 *
 * Merges gift card catalogs from Reloadly and Tremendous,
 * deduplicates by brand (normalized name), and returns a unified list.
 * Each brand includes an `availableProviders` array so the redemption
 * function can pick the cheapest option at order time.
 *
 * Uses double-buffered caching:
 * - Read path: always serves from status='active' row
 * - Write path (refresh=true): writes to 'building', then atomically swaps
 * - At most 2 rows during refresh, 1 after swap (old purged)
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
    return totalFee - discountSavings;
}

// ── Main Handler ───────────────────────────────────────────────────

export async function fetchAndCacheGiftCards(
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

    const activeList = (activeInstruments || []).map((
        i: { instrument: string },
    ) => i.instrument);

    // ── 2. Read path: serve from active cache (skip if refreshing) ──
    if (!isRefresh) {
        const { data: cached } = await supabase
            .from("giftcards_cache")
            .select("data, updated_at")
            .eq("provider", "unified")
            .eq("status", "active")
            .maybeSingle();

        if (cached?.data) {
            const rawCards = cached.data as UnifiedGiftCard[];

            // Filter cached providers by activeList
            const cards = rawCards.map((card) => {
                card.availableProviders = card.availableProviders.filter((p) =>
                    activeList.includes(p.provider)
                );
                return card;
            }).filter((card) => card.availableProviders.length > 0);

            return { cards, cached: true, count: cards.length };
        }
        // No active cache — fall through to live fetch (first boot)
    }

    const brandMap = new Map<string, UnifiedGiftCard>();

    const tremendousKey = env("TREMENDOUS_API_KEY") || "";
    const reloadlyClient = env("RELOADLY_CLIENT_ID") || "";
    const reloadlySecret = env("RELOADLY_CLIENT_SECRET") || "";
    const isSandbox = env("RELOADLY_SANDBOX") !== "false";

    const fetchPromises: Promise<UnifiedGiftCard[]>[] = [];
    let tremendousPromiseIndex = -1;
    let reloadlyPromiseIndex = -1;

    if (activeList.includes("tremendous") && tremendousKey) {
        fetchPromises.push(fetchTremendousCatalog(tremendousKey));
        tremendousPromiseIndex = fetchPromises.length - 1;
    }

    if (activeList.includes("reloadly") && reloadlyClient && reloadlySecret) {
        fetchPromises.push(
            fetchReloadlyCatalog(reloadlyClient, reloadlySecret, isSandbox),
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

    // Process Tremendous first (preferred: free)
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
            `[CATALOG] Tremendous: ${tremendousCards.value.length} products`,
        );
    } else {
        console.error(
            "[CATALOG] Tremendous fetch failed:",
            tremendousCards && tremendousCards.status === "rejected"
                ? tremendousCards.reason
                : "unknown",
        );
    }

    // Process Reloadly — merge into existing brands or add new ones
    if (reloadlyCards && reloadlyCards.status === "fulfilled") {
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
        console.error(
            "[CATALOG] Reloadly fetch failed:",
            reloadlyCards && reloadlyCards.status === "rejected"
                ? reloadlyCards.reason
                : "unknown",
        );
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
        card.processingFeeUsd = Math.max(0, Math.round(typicalFee * 100) / 100);

        cards.push(card);
    }

    // Sort by brand popularity and assign natural brand colors
    const POPULAR_BRANDS = new Map([
        ["amazon", { priority: 1, color: "#FF9900", icon: "📦" }],
        ["amazoncom", { priority: 1, color: "#FF9900", icon: "📦" }],
        ["target", { priority: 2, color: "#CC0000", icon: "🎯" }],
        ["walmart", { priority: 3, color: "#0071CE", icon: "🛒" }],
        ["starbucks", { priority: 4, color: "#00704A", icon: "☕" }],
        ["starbucksus", { priority: 4, color: "#00704A", icon: "☕" }],
        ["apple", { priority: 5, color: "#555555", icon: "🍎" }],
        ["googleplay", { priority: 6, color: "#06C167", icon: "▶️" }],
        ["nike", { priority: 7, color: "#111111", icon: "👟" }],
        ["uber", { priority: 8, color: "#000000", icon: "🚗" }],
        ["doordash", { priority: 9, color: "#FF3008", icon: "🍔" }],
        ["grubhub", { priority: 10, color: "#FF6200", icon: "🍔" }],
        ["netflix", { priority: 11, color: "#E50914", icon: "🍿" }],
        ["spotify", { priority: 12, color: "#1DB954", icon: "🎵" }],
        ["homedepot", { priority: 13, color: "#F96302", icon: "🛠️" }],
        ["lowes", { priority: 14, color: "#004890", icon: "🛠️" }],
        ["bestbuy", { priority: 15, color: "#003791", icon: "🛍️" }],
        ["costco", { priority: 16, color: "#005DAA", icon: "🛒" }],
        ["wholefoods", { priority: 17, color: "#00674B", icon: "🛒" }],
        ["chipotle", { priority: 18, color: "#451400", icon: "🌯" }],
        ["panera", { priority: 19, color: "#4D6B21", icon: "🥖" }],
        ["dunkin", { priority: 20, color: "#FF671F", icon: "🍩" }],
        ["gap", { priority: 21, color: "#000000", icon: "👕" }],
        ["oldnavy", { priority: 22, color: "#000000", icon: "👕" }],
        ["nordstrom", { priority: 23, color: "#000000", icon: "🛍️" }],
        ["macys", { priority: 24, color: "#E11A2B", icon: "🛍️" }],
        ["sephora", { priority: 25, color: "#000000", icon: "💄" }],
        ["ulta", { priority: 26, color: "#F26E21", icon: "💄" }],
        ["adidas", { priority: 27, color: "#000000", icon: "👟" }],
        ["underarmour", { priority: 28, color: "#000000", icon: "👟" }],
        ["airbnb", { priority: 29, color: "#FF5A5F", icon: "🏠" }],
        ["southwest", { priority: 30, color: "#111B4D", icon: "✈️" }],
        ["delta", { priority: 31, color: "#E01931", icon: "✈️" }],
        ["lyft", { priority: 32, color: "#FF00BF", icon: "🚗" }],
        ["instacart", { priority: 33, color: "#003D29", icon: "🛒" }],
        ["gamestop", { priority: 34, color: "#E31837", icon: "🎮" }],
        ["playstation", { priority: 35, color: "#003791", icon: "🎮" }],
        ["xbox", { priority: 36, color: "#107C10", icon: "🎮" }],
        ["steam", { priority: 37, color: "#171A21", icon: "🎮" }],
        ["roblox", { priority: 38, color: "#FFFFFF", icon: "🎮" }],
        ["nintendo", { priority: 39, color: "#E60012", icon: "🎮" }],
        ["hulu", { priority: 40, color: "#1CE783", icon: "📺" }],
    ]);
    for (const card of cards) {
        const meta = POPULAR_BRANDS.get(card.brandKey);
        if (meta) {
            card.brandColor = meta.color;
            if (meta.icon) card.brandIcon = meta.icon;
        }
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
        `[CATALOG] Final: ${cards.length} unique brands`,
    );

    // ── Cache results with double-buffer swap ──
    if (cards.length > 0) {
        if (isRefresh) {
            // Cron refresh path: write to 'building', then atomic swap
            // 1. Clean up any leftover 'building' row from a prior failed refresh
            await supabase.from("giftcards_cache")
                .delete()
                .eq("provider", "unified")
                .eq("status", "building");

            // 2. Insert new data as 'building'
            await supabase.from("giftcards_cache").insert({
                provider: "unified",
                status: "building",
                data: cards,
                updated_at: new Date().toISOString(),
            });

            // 3. Atomic swap: delete old active, rename building → active
            await supabase.from("giftcards_cache")
                .delete()
                .eq("provider", "unified")
                .eq("status", "active");

            await supabase.from("giftcards_cache")
                .update({ status: "active" })
                .eq("provider", "unified")
                .eq("status", "building");

            console.log(
                `[CATALOG] Double-buffer swap complete: ${cards.length} brands`,
            );
        } else {
            // First-boot path: insert directly as active
            await supabase.from("giftcards_cache").upsert({
                provider: "unified",
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
        // Parse refresh flag from URL or POST body
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

        const result = await fetchAndCacheGiftCards(supabase, env, isRefresh);
        return jsonOk(result, corsHeaders);
    });
}
