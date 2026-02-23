import {
    mapCategory,
    ProviderOrderResult,
    UnifiedGiftCard,
} from "./gift-card-types.ts";

export async function fetchTremendousCatalog(
    apiKey: string,
): Promise<UnifiedGiftCard[]> {
    if (!apiKey) return [];

    const res = await fetch(
        "https://testflight.tremendous.com/api/v2/products?country=US",
        {
            headers: { Authorization: `Bearer ${apiKey}` },
        },
    );

    if (!res.ok) {
        throw new Error(`Tremendous API ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const cards: UnifiedGiftCard[] = [];

    for (const product of data.products || []) {
        if (product.category !== "merchant_card") continue;
        if (!product.currency_codes?.includes("USD")) continue;

        const skus = product.skus || [];
        const minValue = skus.length > 0
            ? Math.min(...skus.map((s: any) => s.min ?? s.value ?? 5))
            : 5;
        const maxValue = skus.length > 0
            ? Math.max(...skus.map((s: any) => s.max ?? s.value ?? 500))
            : 500;
        const fixedDenoms = skus.filter((s: any) => s.value != null).map((
            s: any,
        ) => s.value);

        cards.push({
            id: "",
            brandName: product.name,
            brandKey: "",
            logoUrl: product.images?.[0]?.src || "",
            cardImageUrl: product.images?.[0]?.src || "",
            category: mapCategory(product.category),
            denominationType: fixedDenoms.length > 0 ? "fixed" : "range",
            fixedDenominations: fixedDenoms,
            minDenomination: minValue,
            maxDenomination: maxValue,
            currencyCode: "USD",
            availableProviders: [{
                provider: "tremendous",
                productId: product.id,
                discountPercentage: 0,
                feePerTransaction: 0,
                feePercentage: 0,
            }],
            hasProcessingFee: false,
            processingFeeUsd: 0,
            brandColor: "#4B5563",
            brandIcon: "🎁",
        });
    }
    return cards;
}

export async function orderFromTremendous(
    apiKey: string,
    productId: string,
    brandName: string,
    faceValueCents: number,
): Promise<ProviderOrderResult> {
    let catalogId = productId;

    if (!catalogId) {
        const searchRes = await fetch(
            "https://testflight.tremendous.com/api/v2/products?country=US",
            {
                headers: { Authorization: `Bearer ${apiKey}` },
            },
        );

        if (searchRes.ok) {
            const data = await searchRes.json();
            const searchName = brandName.toLowerCase();

            // Look for exact match or special US mappings (Amazon -> Amazon.com)
            const exactMatch = (data.products || []).find((p: any) => {
                const pName = p.name?.toLowerCase() || "";
                if (pName === searchName) return true;
                if (searchName === "amazon" && pName === "amazon.com") {
                    return true;
                }
                return false;
            });

            // Fallback to substring matching if no exact match (less safe but works for variants like AMC Theatres)
            const fallbackMatch = (data.products || []).find((p: any) =>
                (p.name?.toLowerCase() || "").includes(searchName)
            );

            const match = exactMatch || fallbackMatch;
            if (match) catalogId = match.id;
        }
    }

    if (!catalogId) {
        throw new Error(
            `Brand "${brandName}" not found on Tremendous (US Region)`,
        );
    }

    const response = await fetch(
        "https://testflight.tremendous.com/api/v2/orders",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                payment: { funding_source_id: "balance" },
                rewards: [{
                    value: {
                        denomination: faceValueCents / 100,
                        currency_code: "USD",
                    },
                    delivery: { method: "LINK" },
                    recipient: { name: "CasaGrown User" },
                    products: [catalogId],
                }],
            }),
        },
    );

    if (!response.ok) {
        throw new Error(`Tremendous API error: ${await response.text()}`);
    }

    const data = await response.json();
    const reward = data.order?.rewards?.[0];

    return {
        provider: "tremendous",
        externalOrderId: data.order?.id || "unknown",
        cardCode: reward?.credential?.code,
        cardUrl: reward?.credential?.link,
        actualCostCents: faceValueCents,
    };
}
