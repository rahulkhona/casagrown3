export interface UnifiedGiftCard {
    id: string;
    brandName: string;
    brandKey: string;
    logoUrl: string;
    cardImageUrl?: string;
    brandColor: string;
    brandIcon: string;
    category: string;
    denominationType: "fixed" | "range";
    fixedDenominations: number[];
    minDenomination: number;
    maxDenomination: number;
    currencyCode: string;
    availableProviders: any[];
    hasProcessingFee: boolean;
    processingFeeUsd: number;
}

export interface ProviderOrderResult {
    provider: string;
    externalOrderId: string;
    cardCode?: string;
    cardUrl?: string;
    actualCostCents: number;
}

export function mapCategory(
    tremendousCategory?: string,
    reloadlyCategory?: string,
): string {
    const cat = (tremendousCategory || reloadlyCategory || "").toLowerCase();
    if (cat.includes("food") || cat.includes("restaurant")) return "Food";
    if (cat.includes("gaming") || cat.includes("game")) return "Gaming";
    if (
        cat.includes("entertainment") || cat.includes("stream") ||
        cat.includes("media")
    ) return "Entertainment";
    return "Shopping";
}

const OPEN_LOOP_KEYWORDS = [
    "visa",
    "mastercard",
    "amex",
    "american express",
    "discover",
    "prepaid",
    "virtual card",
    "virtual debit",
    "virtual credit",
    "gift card mall",
    "one4all",
    "vanilla",
    "greendot",
    "green dot",
    "netspend",
    "paypal",
    "venmo",
    "cash app",
    "crypto",
    "bitcoin",
];

export function isOpenLoopCard(brandName: string): boolean {
    const lower = brandName.toLowerCase();
    return OPEN_LOOP_KEYWORDS.some((kw) => lower.includes(kw));
}
