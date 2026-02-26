import {
    isOpenLoopCard,
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

    const data = await res.json() as Record<string, unknown>;
    const products = (data.products as Record<string, unknown>[]) || [];

    const cards: UnifiedGiftCard[] = [];

    for (const product of products) {
        // filter out open-loop cards if needed
        const brandName = (product.name as string) || "";
        if (isOpenLoopCard(brandName)) continue;
        if ((product.category as string) !== "merchant_card") continue;
        if (!(product.currency_codes as string[])?.includes("USD")) continue;

        const isFixed = (product.currency_format as string) === "fixed";
        cards.push({
            id: String(product.id),
            brandName: brandName,
            brandKey: brandName,
            logoUrl: (product.images as { url?: string }[])?.[0]?.url || "",
            cardImageUrl: (product.images as { url?: string }[])?.[0]?.url ||
                "",
            category: mapCategory(String(product.category), undefined),
            denominationType: isFixed ? "fixed" : "range",
            fixedDenominations: isFixed
                ? (product.skus as { face_value?: number }[])?.map((s) =>
                    s.face_value || 0
                ) || []
                : [],
            minDenomination: Number(product.min_face_value || 5),
            maxDenomination: Number(product.max_face_value || 2000),
            currencyCode: String(product.currency_code || "USD"),
            availableProviders: [{
                provider: "tremendous",
                productId: String(product.id),
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
            const data = await searchRes.json() as Record<string, unknown>;
            const products = (data.products as Record<string, unknown>[]) || [];
            const searchName = brandName.toLowerCase();

            // Look for exact match or special US mappings (Amazon -> Amazon.com)
            const exactMatch = products.find((p: Record<string, unknown>) => {
                const pName = (p.name as string)?.toLowerCase() || "";
                if (pName === searchName) return true;
                if (searchName === "amazon" && pName === "amazon.com") {
                    return true;
                }
                return false;
            });

            // Fallback to substring matching if no exact match (less safe but works for variants like AMC Theatres)
            const fallbackMatch = products.find((p: Record<string, unknown>) =>
                ((p.name as string)?.toLowerCase() || "").includes(searchName)
            );

            const match = exactMatch || fallbackMatch;
            if (match) catalogId = match.id as string;
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

    const data = await response.json() as Record<string, unknown>;
    const order = data.order as Record<string, unknown>;
    const reward = (order?.rewards as Record<string, unknown>[])?.[0];

    return {
        provider: "tremendous",
        externalOrderId: (order?.id as string) || "unknown",
        cardCode: (reward?.credential as Record<string, unknown>)
            ?.code as string,
        cardUrl: (reward?.credential as Record<string, unknown>)
            ?.link as string,
        actualCostCents: faceValueCents,
    };
}

export async function fetchTremendousBalance(apiKey: string): Promise<number> {
    const res = await fetch(
        "https://testflight.tremendous.com/api/v2/funding_sources",
        {
            headers: { Authorization: `Bearer ${apiKey}` },
        },
    );

    if (!res.ok) {
        throw new Error(
            `Tremendous Balance API error: ${await res.text()}`,
        );
    }

    const data = (await res.json()) as Record<string, unknown>;
    // Assuming 'balance' is the funding source type we care about
    const balanceSource =
        ((data.funding_sources as Record<string, unknown>[]) || []).find((s) =>
            s.method === "balance"
        );

    if (!balanceSource) return 0;

    // Convert to cents
    return Math.round(
        Number(
            (balanceSource.meta as Record<string, number>)?.available_cents ||
                0,
        ),
    );
}
