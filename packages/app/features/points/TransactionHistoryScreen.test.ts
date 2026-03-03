/**
 * Unit tests for TransactionHistoryScreen helper functions.
 * Tests buildDescription(), mapLedgerType(), and mapLedgerToTransaction().
 *
 * Uses .test.ts (no JSX) since these are pure function tests.
 * All dependencies are stubbed via jest.mock() to avoid JSX parse issues.
 */

// ─── Stub every import that TransactionHistoryScreen.tsx pulls in ────────────
jest.mock("react", () => ({ ...jest.requireActual("react") }));
jest.mock("react-native", () => ({
    Platform: {
        OS: "web",
        select: (o: Record<string, unknown>) => o["web"] ?? o["default"],
    },
    StyleSheet: { create: (s: Record<string, unknown>) => s },
    Dimensions: { get: () => ({ width: 400, height: 800 }) },
    Alert: { alert: jest.fn() },
    Linking: { openURL: jest.fn() },
    Clipboard: { setString: jest.fn() },
    View: jest.fn(),
    Text: jest.fn(),
    ScrollView: jest.fn(),
    TouchableOpacity: jest.fn(),
}));

jest.mock("tamagui", () => {
    const noop = jest.fn();
    const stub = () => null;
    const StubComp = Object.assign(stub, {
        Overlay: stub,
        Handle: stub,
        Frame: stub,
        ScrollView: stub,
        Trigger: stub,
        Portal: stub,
        Content: stub,
        Title: stub,
        Description: stub,
        Close: stub,
    });
    return {
        Button: noop,
        Text: noop,
        H3: noop,
        Paragraph: noop,
        Separator: noop,
        YStack: noop,
        XStack: noop,
        Spinner: noop,
        Input: noop,
        ScrollView: noop,
        Sheet: StubComp,
        Dialog: StubComp,
    };
});

jest.mock(
    "@tamagui/lucide-icons",
    () => new Proxy({}, { get: () => () => null }),
);

jest.mock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: jest.fn(),
    SafeAreaView: jest.fn(),
}));

jest.mock("../auth/auth-hook", () => ({
    supabase: {
        from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            then: jest.fn(),
        }),
        rpc: jest.fn().mockResolvedValue({
            data: { total_balance: 0, purchased_balance: 0, earned_balance: 0 },
            error: null,
        }),
    },
}));

jest.mock("../../design-tokens", () => {
    const mk = (b: string) => {
        const o: Record<number, string> = {};
        for (const s of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
            o[s] = b;
        }
        return o;
    };
    return {
        colors: {
            green: mk("#16a34a"),
            red: mk("#dc2626"),
            gray: mk("#6b7280"),
            blue: mk("#2563eb"),
            purple: mk("#9333ea"),
            amber: mk("#f59e0b"),
            pink: mk("#ec4899"),
            orange: mk("#f97316"),
            yellow: mk("#eab308"),
            indigo: mk("#6366f1"),
            teal: mk("#14b8a6"),
            cyan: mk("#06b6d4"),
            emerald: mk("#10b981"),
            rose: mk("#f43f5e"),
            sky: mk("#0ea5e9"),
            slate: mk("#64748b"),
            stone: mk("#78716c"),
            zinc: mk("#71717a"),
            neutral: mk("#737373"),
            white: "#ffffff",
            black: "#000000",
        },
        borderRadius: { sm: 4, md: 6, lg: 8, xl: 12 },
        tc: (c: string) => c,
    };
});

jest.mock("solito/link", () => ({ Link: jest.fn() }));
jest.mock("solito/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useSearchParams: () => ({}),
}));

// ─── Now import the helpers ──────────────────────────────────────────────────
import {
    buildDescription,
    mapLedgerToTransaction,
    mapLedgerType,
} from "./TransactionHistoryScreen";

// =============================================================================
// mapLedgerType
// =============================================================================
describe("mapLedgerType", () => {
    it("maps purchase type", () => {
        expect(mapLedgerType("purchase", 1000)).toBe("purchase");
    });

    it("maps positive payment to sale_credit", () => {
        expect(mapLedgerType("payment", 500)).toBe("sale_credit");
    });

    it("maps negative payment to order_debit", () => {
        expect(mapLedgerType("payment", -300)).toBe("order_debit");
    });

    it("maps redemption type", () => {
        expect(mapLedgerType("redemption", -100)).toBe("redemption");
    });

    it("maps donation type", () => {
        expect(mapLedgerType("donation", -500)).toBe("donation");
    });

    it("maps refund type", () => {
        expect(mapLedgerType("refund", -100)).toBe("refund");
    });

    it("maps reward to referral", () => {
        expect(mapLedgerType("reward", 50)).toBe("referral");
    });

    it("maps unknown positive amount to purchase", () => {
        expect(mapLedgerType("unknown_type", 100)).toBe("purchase");
    });

    it("maps unknown negative amount to order_debit", () => {
        expect(mapLedgerType("unknown_type", -100)).toBe("order_debit");
    });
});

// =============================================================================
// buildDescription
// =============================================================================
describe("buildDescription", () => {
    it("builds purchase description", () => {
        expect(buildDescription("purchase", 1000, {})).toBe(
            "Purchased 1,000 points",
        );
    });

    it("builds gift card redemption with brand and value", () => {
        const result = buildDescription("redemption", -100, {
            brand_name: "Amazon.com",
            face_value_cents: 100,
        });
        expect(result).toBe("Redeemed: Amazon.com $1 Gift Card");
    });

    it("builds PayPal redemption description from meta.description", () => {
        const result = buildDescription("redemption", -500, {
            provider: "paypal",
            description: "Cashout to PayPal/Venmo",
        });
        expect(result).toBe("Cashout to PayPal/Venmo");
    });

    it("builds donation description with org name", () => {
        const result = buildDescription("donation", -1000, {
            organization: "Food for All Foundation",
        });
        expect(result).toBe("Donated to: Food for All Foundation");
    });

    it("builds sale credit description with product", () => {
        const result = buildDescription("sale_credit", 200, {
            product: "Organic Tomatoes",
        });
        expect(result).toBe("Sale: Organic Tomatoes");
    });

    it("builds refund description with brand_name (gift card refund)", () => {
        const result = buildDescription("refund", -100, {
            brand_name: "Amazon.com",
            face_value_cents: 100,
        });
        expect(result).toBe("Refunded: Amazon.com $1 Gift Card");
    });

    it("detects gift card refund via provider=tremendous even without brand_name", () => {
        const result = buildDescription("refund", -100, {
            provider: "tremendous",
            refund_method: "Transferred to E-Gift Card",
        });
        expect(result).toContain("Gift Card");
    });

    it('detects gift card refund via refund_method containing "Gift Card"', () => {
        const result = buildDescription("refund", -200, {
            refund_method: "Transferred to E-Gift Card",
        });
        expect(result).toContain("Gift Card");
    });

    it("builds card refund description with card_last4", () => {
        const result = buildDescription("refund", -1000, {
            card_last4: "4242",
        });
        expect(result).toBe("Refund to card ending in 4242");
    });

    it("falls back to generic refund description", () => {
        const result = buildDescription("refund", -500, {});
        expect(result).toBe("Refund for returned points");
    });
});

// =============================================================================
// mapLedgerToTransaction
// =============================================================================
describe("mapLedgerToTransaction", () => {
    it("maps a purchase row correctly", () => {
        const row = {
            id: "abc-123",
            type: "purchase",
            amount: 1000,
            created_at: "2026-02-28T12:00:00Z",
            metadata: {},
        };
        const tx = mapLedgerToTransaction(row);
        expect(tx.type).toBe("purchase");
        expect(tx.amount).toBe(1000);
        expect(tx.description).toBe("Purchased 1,000 points");
    });

    it("maps a gift card redemption with card metadata", () => {
        const row = {
            id: "def-456",
            type: "redemption",
            amount: -100,
            created_at: "2026-02-28T12:00:00Z",
            metadata: {
                brand_name: "Starbucks",
                face_value_cents: 500,
                gift_card_code: "STAR-1234",
                gift_card_url: "https://example.com/card",
                provider: "tremendous",
            },
        };
        const tx = mapLedgerToTransaction(row);
        expect(tx.type).toBe("redemption");
        expect(tx.giftCardCode).toBe("STAR-1234");
        expect(tx.giftCardUrl).toBe("https://example.com/card");
        expect(tx.provider).toBe("tremendous");
        expect(tx.description).toContain("Starbucks");
    });

    it("maps a refund with gift card provider metadata", () => {
        const row = {
            id: "ghi-789",
            type: "refund",
            amount: -100,
            created_at: "2026-02-28T12:00:00Z",
            metadata: {
                provider: "tremendous",
                bucket_id: "bucket-1",
                refund_method: "Transferred to E-Gift Card",
                brand_name: "Amazon.com",
                face_value_cents: 100,
            },
        };
        const tx = mapLedgerToTransaction(row);
        expect(tx.type).toBe("refund");
        expect(tx.provider).toBe("tremendous");
        expect(tx.description).toContain("Amazon.com");
        expect(tx.description).toContain("Gift Card");
    });

    it("maps purchaseCardInfo from card_last4 metadata", () => {
        const row = {
            id: "purchase-card",
            type: "purchase",
            amount: 1000,
            created_at: "2026-02-28T12:00:00Z",
            metadata: {
                card_last4: "4242",
                card_brand: "Visa",
                amount_cents: 1000,
                service_fee_cents: 33,
            },
        };
        const tx = mapLedgerToTransaction(row);
        expect(tx.purchaseCardInfo).toBe("Visa ending in 4242");
        expect(tx.purchaseUsdAmount).toBe(10);
        expect(tx.purchaseStripeFee).toBe(0.33);
    });

    it("maps a sales_tax ledger entry", () => {
        const row = {
            id: "tax-001",
            type: "sales_tax",
            amount: -3,
            created_at: "2026-03-02T12:00:00Z",
            metadata: {
                product: "Organic Flowers",
                tax_rate_pct: 9.25,
                tax_amount: 3,
                delivery_address: "123 Main St, San Jose, CA 95120",
            },
        };
        const tx = mapLedgerToTransaction(row);
        expect(tx.type).toBe("sales_tax");
        expect(tx.amount).toBe(-3);
        expect(tx.description).toContain("Sales Tax");
    });
});

// =============================================================================
// Sales Tax specific tests
// =============================================================================
describe("sales_tax ledger type", () => {
    it("mapLedgerType handles sales_tax", () => {
        expect(mapLedgerType("sales_tax", -3)).toBe("sales_tax");
    });

    it("buildDescription formats sales tax with product and rate", () => {
        const result = buildDescription("sales_tax", -3, {
            product: "Organic Flowers",
            tax_rate_pct: 9.25,
            tax_amount: 3,
        });
        expect(result).toContain("Sales Tax");
    });

    it("buildDescription handles sales tax with delivery address", () => {
        const result = buildDescription("sales_tax", -3, {
            product: "Roses",
            tax_rate_pct: 8.5,
            tax_amount: 3,
            delivery_address: "456 Oak Ave, Los Angeles, CA 90210",
        });
        expect(result).toContain("Sales Tax");
    });
});
