/**
 * Mock data for the Redemption Store
 *
 * Shapes mirror the unified API response from fetch-gift-cards so the UI
 * stays the same whether loading from edge function or falling back to mock.
 */

// ── Shared Types (match edge function output) ──────────────────────

export interface ProviderOption {
    provider: "tremendous" | "reloadly";
    productId: string;
    /** Discount off face value (0–100) */
    discountPercentage: number;
    /** Flat fee per transaction in USD */
    feePerTransaction: number;
    /** % fee on face value */
    feePercentage: number;
}

export interface GiftCardProduct {
    id: string;
    brandName: string;
    brandKey: string;
    /** Brand logo image (square) */
    logoUrl: string;
    /** Full gift card design image from Tremendous (optional) */
    cardImageUrl?: string;
    /** Hex accent color for card tile */
    brandColor: string;
    /** Emoji fallback when logo can't load */
    brandIcon: string;
    category: string;
    denominationType: "fixed" | "range";
    fixedDenominations: number[];
    minDenomination: number;
    maxDenomination: number;
    currencyCode: string;
    /** All providers carrying this brand, sorted cheapest first */
    availableProviders: ProviderOption[];
    /** Whether there's an extra processing fee beyond the face value */
    hasProcessingFee: boolean;
    /** Processing fee in USD (0 if no fee) */
    processingFeeUsd: number;
}

// ── Backward-compat helpers ────────────────────────────────────────

/** Get the preferred (cheapest) provider for a card */
export function getPreferredProvider(
    card: GiftCardProduct,
): ProviderOption | undefined {
    return card.availableProviders[0];
}

/** Compute the net fee for a specific face value */
export function computeNetFeeForCard(
    card: GiftCardProduct,
    faceValueUsd: number,
): number {
    const provider = card.availableProviders[0];
    if (!provider) return 0;
    const discountSavings = faceValueUsd *
        (provider.discountPercentage / 100);
    const totalFee = provider.feePerTransaction +
        faceValueUsd * (provider.feePercentage / 100);
    return Math.max(0, totalFee - discountSavings);
}

// ── Mock Gift Cards ────────────────────────────────────────────────

export const MOCK_GIFT_CARDS: GiftCardProduct[] = [
    {
        id: "brand-amazon",
        brandName: "Amazon",
        brandKey: "amazon",
        logoUrl: "",
        brandColor: "#FF9900",
        brandIcon: "📦",
        category: "Shopping",
        denominationType: "range",
        fixedDenominations: [25, 50, 100],
        minDenomination: 10,
        maxDenomination: 500,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "tremendous",
                productId: "mock-amazon",
                discountPercentage: 0,
                feePerTransaction: 0,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: false,
        processingFeeUsd: 0,
    },
    {
        id: "brand-target",
        brandName: "Target",
        brandKey: "target",
        logoUrl: "",
        brandColor: "#CC0000",
        brandIcon: "🎯",
        category: "Shopping",
        denominationType: "range",
        fixedDenominations: [25, 50, 100],
        minDenomination: 10,
        maxDenomination: 500,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "reloadly",
                productId: "mock-target",
                discountPercentage: 0,
                feePerTransaction: 0.50,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: true,
        processingFeeUsd: 0.50,
    },
    {
        id: "brand-starbucks",
        brandName: "Starbucks",
        brandKey: "starbucks",
        logoUrl: "",
        brandColor: "#00704A",
        brandIcon: "☕",
        category: "Food",
        denominationType: "range",
        fixedDenominations: [10, 25, 50],
        minDenomination: 5,
        maxDenomination: 100,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "tremendous",
                productId: "mock-starbucks",
                discountPercentage: 0,
                feePerTransaction: 0,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: false,
        processingFeeUsd: 0,
    },
    {
        id: "brand-doordash",
        brandName: "DoorDash",
        brandKey: "doordash",
        logoUrl: "",
        brandColor: "#FF3008",
        brandIcon: "🚗",
        category: "Food",
        denominationType: "range",
        fixedDenominations: [25, 50, 100],
        minDenomination: 15,
        maxDenomination: 200,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "reloadly",
                productId: "mock-doordash",
                discountPercentage: 0,
                feePerTransaction: 0.50,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: true,
        processingFeeUsd: 0.50,
    },
    {
        id: "brand-uber-eats",
        brandName: "Uber Eats",
        brandKey: "uber eats",
        logoUrl: "",
        brandColor: "#06C167",
        brandIcon: "🍔",
        category: "Food",
        denominationType: "range",
        fixedDenominations: [15, 25, 50],
        minDenomination: 10,
        maxDenomination: 200,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "tremendous",
                productId: "mock-uber-eats",
                discountPercentage: 0,
                feePerTransaction: 0,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: false,
        processingFeeUsd: 0,
    },
    {
        id: "brand-nike",
        brandName: "Nike",
        brandKey: "nike",
        logoUrl: "",
        brandColor: "#111111",
        brandIcon: "👟",
        category: "Shopping",
        denominationType: "range",
        fixedDenominations: [25, 50, 100, 200],
        minDenomination: 25,
        maxDenomination: 500,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "reloadly",
                productId: "mock-nike",
                discountPercentage: 0,
                feePerTransaction: 0.50,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: true,
        processingFeeUsd: 0.50,
    },
    {
        id: "brand-apple",
        brandName: "Apple",
        brandKey: "apple",
        logoUrl: "",
        brandColor: "#555555",
        brandIcon: "🍎",
        category: "Entertainment",
        denominationType: "range",
        fixedDenominations: [25, 50, 100],
        minDenomination: 10,
        maxDenomination: 200,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "tremendous",
                productId: "mock-apple",
                discountPercentage: 0,
                feePerTransaction: 0,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: false,
        processingFeeUsd: 0,
    },
    {
        id: "brand-playstation",
        brandName: "PlayStation",
        brandKey: "playstation",
        logoUrl: "",
        brandColor: "#003791",
        brandIcon: "🎮",
        category: "Gaming",
        denominationType: "range",
        fixedDenominations: [25, 50, 100],
        minDenomination: 10,
        maxDenomination: 100,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "reloadly",
                productId: "mock-playstation",
                discountPercentage: 0,
                feePerTransaction: 0.50,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: true,
        processingFeeUsd: 0.50,
    },
    {
        id: "brand-walmart",
        brandName: "Walmart",
        brandKey: "walmart",
        logoUrl: "",
        brandColor: "#0071CE",
        brandIcon: "🏪",
        category: "Shopping",
        denominationType: "range",
        fixedDenominations: [25, 50, 100, 200],
        minDenomination: 10,
        maxDenomination: 500,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "tremendous",
                productId: "mock-walmart",
                discountPercentage: 0,
                feePerTransaction: 0,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: false,
        processingFeeUsd: 0,
    },
    {
        id: "brand-netflix",
        brandName: "Netflix",
        brandKey: "netflix",
        logoUrl: "",
        brandColor: "#E50914",
        brandIcon: "🎬",
        category: "Entertainment",
        denominationType: "range",
        fixedDenominations: [25, 50, 100],
        minDenomination: 15,
        maxDenomination: 200,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "reloadly",
                productId: "mock-netflix",
                discountPercentage: 0,
                feePerTransaction: 0.50,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: true,
        processingFeeUsd: 0.50,
    },
    {
        id: "brand-chipotle",
        brandName: "Chipotle",
        brandKey: "chipotle",
        logoUrl: "",
        brandColor: "#A81612",
        brandIcon: "🌯",
        category: "Food",
        denominationType: "range",
        fixedDenominations: [10, 25, 50],
        minDenomination: 10,
        maxDenomination: 100,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "tremendous",
                productId: "mock-chipotle",
                discountPercentage: 0,
                feePerTransaction: 0,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: false,
        processingFeeUsd: 0,
    },
    {
        id: "brand-xbox",
        brandName: "Xbox",
        brandKey: "xbox",
        logoUrl: "",
        brandColor: "#107C10",
        brandIcon: "🕹️",
        category: "Gaming",
        denominationType: "range",
        fixedDenominations: [25, 50, 100],
        minDenomination: 10,
        maxDenomination: 100,
        currencyCode: "USD",
        availableProviders: [
            {
                provider: "reloadly",
                productId: "mock-xbox",
                discountPercentage: 0,
                feePerTransaction: 0.50,
                feePercentage: 0,
            },
        ],
        hasProcessingFee: true,
        processingFeeUsd: 0.50,
    },
];

export const GIFT_CARD_CATEGORIES = [
    "All",
    "Shopping",
    "Food",
    "Entertainment",
    "Gaming",
];

export interface CharityProject {
    id: number;
    title: string;
    organization: string;
    theme: string;
    imageUrl: string;
    goal: number;
    raised: number;
    summary: string;
}

export const MOCK_CHARITIES: CharityProject[] = [
    {
        id: 1001,
        title: "Feed Families in Rural Communities",
        organization: "Food For All Foundation",
        theme: "Hunger",
        imageUrl:
            "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=400",
        goal: 20000,
        raised: 13400,
        summary:
            "Providing fresh meals and produce to underserved rural families.",
    },
    {
        id: 1002,
        title: "Community Garden Reforestation",
        organization: "Green Earth Initiative",
        theme: "Environment",
        imageUrl:
            "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400",
        goal: 15000,
        raised: 6750,
        summary:
            "Planting trees and restoring community garden spaces across the region.",
    },
    {
        id: 1003,
        title: "After-School Garden Program",
        organization: "Future Leaders Co.",
        theme: "Education",
        imageUrl:
            "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=400",
        goal: 10000,
        raised: 8800,
        summary:
            "Teaching kids sustainable gardening and nutrition after school.",
    },
    {
        id: 1004,
        title: "Nutritious School Lunches",
        organization: "Healthy Kids Now",
        theme: "Health",
        imageUrl:
            "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
        goal: 25000,
        raised: 6250,
        summary: "Supplying fresh, locally-grown lunches to schools in need.",
    },
];

export const CHARITY_THEMES = [
    "All",
    "Hunger",
    "Environment",
    "Education",
    "Health",
];

export const POINTS_PER_DOLLAR = 100;
