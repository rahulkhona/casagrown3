import {
    isOpenLoopCard,
    mapCategory,
    ProviderOrderResult,
    UnifiedGiftCard,
} from "./gift-card-types.ts";

export async function fetchReloadlyCatalog(
    clientId: string,
    clientSecret: string,
    isSandbox: boolean,
): Promise<UnifiedGiftCard[]> {
    if (!clientId || !clientSecret) return [];

    const audience = isSandbox
        ? "https://giftcards-sandbox.reloadly.com"
        : "https://giftcards.reloadly.com";

    const tokenRes = await fetch("https://auth.reloadly.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "client_credentials",
            audience,
        }),
    });

    if (!tokenRes.ok) {
        throw new Error(
            `Reloadly auth failed ${tokenRes.status}: ${await tokenRes.text()}`,
        );
    }
    const { access_token } = await tokenRes.json();

    const allProducts: any[] = [];
    let page = 1;
    const pageSize = 100;

    while (page <= 2) {
        const catalogRes = await fetch(
            `${audience}/products?size=${pageSize}&page=${page}&countryCode=US`,
            { headers: { Authorization: `Bearer ${access_token}` } },
        );

        if (!catalogRes.ok) break;
        const catalogData = await catalogRes.json();
        const content = catalogData.content || [];
        allProducts.push(...content);
        if (content.length < pageSize) break;
        page++;
    }

    const cards: UnifiedGiftCard[] = [];

    for (const product of allProducts) {
        const brandName = product.productName || product.brand?.brandName || "";
        if (isOpenLoopCard(brandName)) continue;

        const isFixed = product.denominationType === "FIXED";
        const fixedDenoms = product.fixedRecipientDenominations || [];

        cards.push({
            id: "",
            brandName: product.productName || product.brand?.brandName || "",
            brandKey: "",
            logoUrl: product.logoUrls?.[0] || product.brand?.logoUrls?.[0] ||
                "",
            category: mapCategory(undefined, product.category?.name),
            denominationType: isFixed ? "fixed" : "range",
            fixedDenominations: fixedDenoms,
            minDenomination: isFixed
                ? (fixedDenoms[0] || 5)
                : (product.minRecipientDenomination || 5),
            maxDenomination: isFixed
                ? (fixedDenoms[fixedDenoms.length - 1] || 500)
                : (product.maxRecipientDenomination || 500),
            currencyCode: product.recipientCurrencyCode || "USD",
            availableProviders: [{
                provider: "reloadly",
                productId: String(product.productId),
                discountPercentage: product.discountPercentage || 0,
                feePerTransaction: product.senderFee || 0,
                feePercentage: product.senderFeePercentage || 0,
            }],
            hasProcessingFee: false,
            processingFeeUsd: 0,
            brandColor: "#6B7280",
            brandIcon: "🎁",
        });
    }

    return cards;
}

export async function orderFromReloadly(
    clientId: string,
    clientSecret: string,
    productId: string,
    brandName: string,
    faceValueCents: number,
    isSandbox: boolean,
): Promise<ProviderOrderResult> {
    const audience = isSandbox
        ? "https://giftcards-sandbox.reloadly.com"
        : "https://giftcards.reloadly.com";

    const tokenRes = await fetch("https://auth.reloadly.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "client_credentials",
            audience,
        }),
    });

    if (!tokenRes.ok) throw new Error("Reloadly auth failed");
    const { access_token } = await tokenRes.json();

    let resolvedProductId = productId;
    if (!resolvedProductId) {
        const searchRes = await fetch(
            `${audience}/products?productName=${
                encodeURIComponent(brandName)
            }&countryCode=US`,
            { headers: { Authorization: `Bearer ${access_token}` } },
        );
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            const match = (searchData.content || [])[0];
            if (match) resolvedProductId = String(match.productId);
        }
    }

    if (!resolvedProductId) {
        throw new Error(`Brand "${brandName}" not found on Reloadly`);
    }

    const orderRes = await fetch(`${audience}/orders`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            productId: Number(resolvedProductId),
            unitPrice: faceValueCents / 100,
            quantity: 1,
            recipientEmail: "customer@casagrown.com",
            senderName: "CasaGrown",
        }),
    });

    if (!orderRes.ok) {
        throw new Error(`Reloadly order failed: ${await orderRes.text()}`);
    }

    const orderData = await orderRes.json();

    return {
        provider: "reloadly",
        externalOrderId: orderData.transactionId?.toString() || "unknown",
        cardCode: orderData.redemptionPin?.code,
        cardUrl: orderData.redemptionPin?.url,
        actualCostCents: Math.round(
            (orderData.smsFee || 0) * 100 + (orderData.fee || 0) * 100 +
                faceValueCents,
        ),
    };
}

export async function fetchReloadlyBalance(
    clientId: string,
    clientSecret: string,
    isSandbox: boolean,
): Promise<number> {
    const audience = isSandbox
        ? "https://giftcards-sandbox.reloadly.com"
        : "https://giftcards.reloadly.com";

    const tokenRes = await fetch("https://auth.reloadly.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "client_credentials",
            audience,
        }),
    });

    if (!tokenRes.ok) throw new Error("Reloadly auth failed");
    const { access_token } = await tokenRes.json();

    const balanceRes = await fetch(`${audience}/accounts/balance`, {
        headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!balanceRes.ok) {
        throw new Error(
            `Reloadly balance API error: ${await balanceRes.text()}`,
        );
    }

    const data = await balanceRes.json();
    // Convert to cents (balance is typically in USD)
    return Math.round((data.balance || 0) * 100);
}
