/**
 * Offer Management — Types & Status Configuration
 *
 * Defines the offer lifecycle state machine for buy-post offers,
 * types for offers, and visual config for status badges.
 */

import { colors } from "../../design-tokens";

// =============================================================================
// Enums
// =============================================================================

export type OfferStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export type OfferUserRole = "buyer" | "seller";

// =============================================================================
// Core Types
// =============================================================================

export interface Offer {
    id: string;
    conversation_id: string;
    post_id: string | null;
    created_by: string;
    quantity: number;
    points_per_unit: number;
    category: string | null;
    product: string | null;
    unit: string | null;
    delivery_date: string | null;
    delivery_dates: string[] | null;
    message: string | null;
    seller_post_id: string | null;
    status: OfferStatus;
    version: number;
    media: Array<{ storage_path: string; media_type: "image" | "video" }>;
    created_at: string;
    updated_at: string | null;
    // Joined data (populated by service layer)
    buyer_name: string | null;
    buyer_avatar_url: string | null;
    seller_name: string | null;
    seller_avatar_url: string | null;
    buyer_id: string | null;
    seller_id: string | null;
}

// =============================================================================
// Offer Filter
// =============================================================================

export type OfferTab = "open" | "past";
export type OfferRoleFilter = "all" | "buying" | "selling";

export interface OfferFilter {
    tab: OfferTab;
    role: OfferRoleFilter;
    searchQuery?: string;
}

// =============================================================================
// Offer Actions
// =============================================================================

export type OfferActionType = "modify" | "withdraw" | "accept" | "reject";

export interface OfferAction {
    type: OfferActionType;
    label: string;
    icon: string;
    color: string;
    bgColor: string;
    destructive?: boolean;
}

// =============================================================================
// Status Visual Config
// =============================================================================

export interface OfferStatusConfig {
    label: string;
    color: string;
    bgColor: string;
    icon: string;
}

export const OFFER_STATUS_CONFIG: Record<OfferStatus, OfferStatusConfig> = {
    pending: {
        label: "Pending",
        color: colors.amber[700],
        bgColor: colors.amber[100],
        icon: "Clock",
    },
    accepted: {
        label: "Accepted",
        color: colors.green[700],
        bgColor: colors.green[100],
        icon: "CheckCircle",
    },
    rejected: {
        label: "Rejected",
        color: colors.red[700],
        bgColor: colors.red[100],
        icon: "XCircle",
    },
    withdrawn: {
        label: "Withdrawn",
        color: colors.gray[600],
        bgColor: colors.gray[100],
        icon: "MinusCircle",
    },
};

// =============================================================================
// State Machine — Valid Transitions
// =============================================================================

/**
 * Map from (currentStatus, role) → allowed next actions.
 * buyer = buy-post author (receives offers)
 * seller = offer maker (submits offers)
 */
export const OFFER_TRANSITIONS: Record<
    OfferStatus,
    { buyer: OfferActionType[]; seller: OfferActionType[] }
> = {
    pending: {
        buyer: ["accept", "reject"],
        seller: ["modify", "withdraw"],
    },
    accepted: {
        buyer: [],
        seller: [],
    },
    rejected: {
        buyer: [],
        seller: [],
    },
    withdrawn: {
        buyer: [],
        seller: [],
    },
};

/** Check if a transition is valid */
export function canOfferTransition(
    offer: Offer,
    userId: string,
    action: OfferActionType,
): boolean {
    const role: OfferUserRole = userId === offer.created_by
        ? "seller"
        : "buyer";
    const allowed = OFFER_TRANSITIONS[offer.status]?.[role] ?? [];
    return allowed.includes(action);
}

/** Get actions available for a user on an offer */
export function getAvailableOfferActions(
    offer: Offer,
    userId: string,
    t: (k: string) => string,
): OfferAction[] {
    const role: OfferUserRole = userId === offer.created_by
        ? "seller"
        : "buyer";
    const allowed = OFFER_TRANSITIONS[offer.status]?.[role] ?? [];
    return allowed
        .map((type) => OFFER_ACTION_CONFIG(t)[type])
        .filter(Boolean) as OfferAction[];
}

/** Is this offer still "open"? */
export function isOpenOffer(offer: Offer): boolean {
    return offer.status === "pending";
}

// =============================================================================
// Action Visual Config
// =============================================================================

export const OFFER_ACTION_CONFIG = (
    t: (k: string) => string,
): Record<OfferActionType, OfferAction> => ({
    accept: {
        type: "accept",
        label: t("offers.actions.accept"),
        icon: "ShoppingCart",
        color: colors.green[700],
        bgColor: colors.green[100],
    },
    reject: {
        type: "reject",
        label: t("offers.actions.reject"),
        icon: "XCircle",
        color: colors.red[600],
        bgColor: colors.red[100],
        destructive: true,
    },
    modify: {
        type: "modify",
        label: t("offers.actions.modify"),
        icon: "Edit3",
        color: colors.amber[700],
        bgColor: colors.amber[100],
    },
    withdraw: {
        type: "withdraw",
        label: t("offers.actions.withdraw"),
        icon: "MinusCircle",
        color: colors.gray[600],
        bgColor: colors.gray[100],
        destructive: true,
    },
});
