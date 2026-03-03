/**
 * get-tax-rate — Supabase Edge Function
 *
 * Returns the applicable sales tax rate for a given (zip_code, state_code,
 * category, product_name) combination.
 *
 * Lookup chain:
 * 1. product_tax_overrides → fixed/exempt rate for specific product
 * 2. category_tax_rules → fixed/exempt rate for category in state
 * 3. zip_tax_cache → cached combined rate from ZipTax API
 * 4. ZipTax API v40 → fetch, cache, and return combined rate
 *
 * Returns:
 *   { rate_pct, rule_type, is_exempt, source }
 */

import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    // Auth check
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;

    // Parse request body
    const { zip_code, state_code, category, product_name } = await req.json();

    if (!zip_code || !state_code || !category) {
        return jsonError(
            "zip_code, state_code, and category are required",
            corsHeaders,
        );
    }

    // ── 1. Check category_tax_rules ─────────────────────────────────────
    const { data: categoryRule } = await supabase
        .from("category_tax_rules")
        .select("id, rule_type, rate_pct")
        .eq("state_code", state_code.toUpperCase())
        .eq("category_name", category)
        .is("effective_until", null)
        .maybeSingle();

    if (categoryRule) {
        // ── 2. Check product_tax_overrides within this category rule ──
        if (product_name) {
            const { data: productOverride } = await supabase
                .from("product_tax_overrides")
                .select("rule_type, rate_pct")
                .eq("category_rule_id", categoryRule.id)
                .ilike("product_name", product_name)
                .is("effective_until", null)
                .maybeSingle();

            if (productOverride) {
                return jsonOk(
                    {
                        rate_pct: Number(productOverride.rate_pct) || 0,
                        rule_type: productOverride.rule_type,
                        is_exempt: productOverride.rule_type === "fixed" &&
                            Number(productOverride.rate_pct) === 0,
                        source: "product_override",
                    },
                    corsHeaders,
                );
            }
        }

        // No product override — use category rule
        if (categoryRule.rule_type === "fixed") {
            return jsonOk(
                {
                    rate_pct: Number(categoryRule.rate_pct) || 0,
                    rule_type: "fixed",
                    is_exempt: Number(categoryRule.rate_pct) === 0,
                    source: "category_rule",
                },
                corsHeaders,
            );
        }
        // rule_type === 'evaluate' → fall through to ZipTax lookup
    }

    // ── 3. Check zip_tax_cache ──────────────────────────────────────────
    const zipOnly = zip_code.replace(/\D/g, "").slice(0, 5);

    const { data: cached } = await supabase
        .from("zip_tax_cache")
        .select(
            "combined_rate, state_rate, county_rate, city_rate, district_rate, expires_at",
        )
        .eq("zip_code", zipOnly)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

    if (cached) {
        const cachedRate = Number(cached.combined_rate);
        return jsonOk(
            {
                rate_pct: cachedRate,
                rule_type: "evaluate",
                is_exempt: cachedRate === 0,
                source: "cache",
                detail: {
                    state_rate: Number(cached.state_rate) || 0,
                    county_rate: Number(cached.county_rate) || 0,
                    city_rate: Number(cached.city_rate) || 0,
                    district_rate: Number(cached.district_rate) || 0,
                },
            },
            corsHeaders,
        );
    }

    // ── 4. Call ZipTax API ──────────────────────────────────────────────
    const apiKey = env("ZIPTAX_API_KEY", true);
    const ziptaxUrl =
        `https://api.zip-tax.com/request/v40?key=${apiKey}&postalcode=${zipOnly}&format=json`;

    try {
        const response = await fetch(ziptaxUrl);
        if (!response.ok) {
            console.error(
                "ZipTax API error:",
                response.status,
                await response.text(),
            );
            return jsonError(
                `ZipTax API error: ${response.status}`,
                corsHeaders,
            );
        }

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            return jsonError(
                `No tax data found for ZIP ${zipOnly}`,
                corsHeaders,
            );
        }

        // Use the first result (most specific match)
        const result = data.results[0];
        const combinedRate = Number(result.taxSales) * 100; // API returns decimal (e.g. 0.0925)
        const stateRate = Number(result.taxUse) * 100 || 0;
        const countyRate = 0; // v40 gives combined, breakdown needs v60
        const cityRate = 0;
        const districtRate = 0;

        // ── 5. Cache the result ─────────────────────────────────────────
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);

        await supabase.from("zip_tax_cache").upsert({
            zip_code: zipOnly,
            combined_rate: combinedRate,
            state_rate: stateRate,
            county_rate: countyRate,
            city_rate: cityRate,
            district_rate: districtRate,
            fetched_at: new Date().toISOString(),
            expires_at: nextMonth.toISOString(),
        });

        return jsonOk(
            {
                rate_pct: combinedRate,
                rule_type: "evaluate",
                is_exempt: combinedRate === 0,
                source: "ziptax_api",
                detail: {
                    state_rate: stateRate,
                    county_rate: countyRate,
                    city_rate: cityRate,
                    district_rate: districtRate,
                },
            },
            corsHeaders,
        );
    } catch (err) {
        console.error("ZipTax fetch error:", err);
        return jsonError(
            "Failed to fetch tax rate from ZipTax API",
            corsHeaders,
        );
    }
});
