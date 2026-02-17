/**
 * Order Management — Types & Status Configuration
 *
 * Defines the order lifecycle state machine, types for orders/offers/
 * escalations/ratings, and visual config for status badges using
 * design tokens.
 */

import { colors } from "../../design-tokens";

// =============================================================================
// Enums
// =============================================================================

export type OrderStatus =
    | "pending"
    | "accepted"
    | "delivered"
    | "completed"
    | "disputed"
    | "escalated"
    | "cancelled";

export type UserRole = "buyer" | "seller";

export type OfferStatus = "pending" | "accepted" | "rejected";

export type EscalationStatus = "open" | "resolved";
export type EscalationResolution =
    | "refund_accepted"
    | "resolved_without_refund"
    | "dismissed";

export type RefundOfferStatus = "pending" | "accepted" | "rejected";
export type RatingScore = 1 | 2 | 3 | 4 | 5;

// =============================================================================
// Core Types
// =============================================================================

export interface Order {
    id: string;
    offer_id: string;
    buyer_id: string;
    seller_id: string;
    conversation_id: string;
    category: string;
    product: string;
    quantity: number;
    points_per_unit: number;
    total_price: number;
    delivery_date: string | null;
    delivery_instructions: string | null;
    delivery_address: string | null;
    delivery_proof_media_id: string | null;
    delivery_proof_url: string | null;
    delivery_proof_location: { latitude: number; longitude: number } | null;
    delivery_proof_timestamp: string | null;
    dispute_proof_media_id: string | null;
    dispute_proof_url: string | null;
    status: OrderStatus;
    buyer_rating: RatingScore | null;
    buyer_feedback: string | null;
    seller_rating: RatingScore | null;
    seller_feedback: string | null;
    created_at: string;
    updated_at: string;
    version: number;
    // Joined data
    buyer_name: string | null;
    buyer_avatar_url: string | null;
    seller_name: string | null;
    seller_avatar_url: string | null;
    post_id: string | null;
    unit: string | null;
}

export interface Offer {
    id: string;
    conversation_id: string;
    created_by: string;
    quantity: number;
    points_per_unit: number;
    status: OfferStatus;
    created_at: string;
}

export interface Escalation {
    id: string;
    order_id: string;
    initiator_id: string;
    reason: string;
    dispute_proof_media_id: string | null;
    dispute_proof_url: string | null;
    status: EscalationStatus;
    resolution_type: EscalationResolution | null;
    accepted_refund_offer_id: string | null;
    resolved_at: string | null;
    created_at: string;
}

export interface RefundOffer {
    id: string;
    escalation_id: string;
    offered_by: string;
    amount: number;
    message: string | null;
    status: RefundOfferStatus;
    created_at: string;
}

export interface OrderRating {
    order_id: string;
    rater_role: UserRole;
    score: RatingScore;
    feedback: string | null;
}

// =============================================================================
// Order Filter
// =============================================================================

export type OrderTab = "open" | "past";
export type OrderRoleFilter = "all" | "buying" | "selling";

export interface OrderFilter {
    tab: OrderTab;
    role: OrderRoleFilter;
    searchQuery?: string;
}

// =============================================================================
// Order Action — What the user can do next
// =============================================================================

export type OrderActionType =
    | "modify"
    | "cancel"
    | "accept"
    | "reject"
    | "suggest_date"
    | "suggest_qty"
    | "mark_delivered"
    | "confirm_delivery"
    | "dispute"
    | "make_offer"
    | "accept_offer"
    | "reject_offer"
    | "escalate"
    | "resolve"
    | "rate";

export interface OrderAction {
    type: OrderActionType;
    label: string;
    icon: string;
    color: string;
    bgColor: string;
    destructive?: boolean;
}

// =============================================================================
// Status Visual Config
// =============================================================================

export interface StatusConfig {
    label: string;
    color: string;
    bgColor: string;
    icon: string;
}

export const ORDER_STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
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
    delivered: {
        label: "Delivered",
        color: "#0369a1", // sky-700
        bgColor: "#e0f2fe", // sky-100
        icon: "Truck",
    },
    completed: {
        label: "Completed",
        color: colors.green[800],
        bgColor: colors.green[100],
        icon: "CheckCircle2",
    },
    disputed: {
        label: "Disputed",
        color: colors.red[700],
        bgColor: colors.red[100],
        icon: "AlertTriangle",
    },
    escalated: {
        label: "Escalated",
        color: "#7c3aed", // purple-600
        bgColor: "#f3e8ff", // purple-100
        icon: "ShieldAlert",
    },
    cancelled: {
        label: "Cancelled",
        color: colors.gray[600],
        bgColor: colors.gray[100],
        icon: "XCircle",
    },
};

// =============================================================================
// State Machine — Valid Transitions
// =============================================================================

/**
 * Map from (currentStatus, role) → allowed next actions.
 */
export const ORDER_TRANSITIONS: Record<
    OrderStatus,
    { buyer: OrderActionType[]; seller: OrderActionType[] }
> = {
    pending: {
        buyer: ["modify", "cancel"],
        seller: ["accept", "reject", "suggest_date", "suggest_qty"],
    },
    accepted: {
        buyer: [],
        seller: ["cancel", "mark_delivered"],
    },
    delivered: {
        buyer: ["confirm_delivery", "dispute"],
        seller: [],
    },
    completed: {
        buyer: ["rate"],
        seller: ["rate"],
    },
    disputed: {
        buyer: ["accept_offer", "resolve", "escalate"],
        seller: ["make_offer", "escalate"],
    },
    escalated: {
        buyer: ["accept_offer", "resolve"],
        seller: ["make_offer", "resolve"],
    },
    cancelled: {
        buyer: [],
        seller: [],
    },
};

/** Check if a transition is valid */
export function canTransition(
    order: Order,
    userId: string,
    action: OrderActionType,
): boolean {
    const role: UserRole = userId === order.buyer_id ? "buyer" : "seller";
    const allowed = ORDER_TRANSITIONS[order.status]?.[role] ?? [];
    return allowed.includes(action);
}

/** Get actions available for a user on an order */
export function getAvailableActions(
    order: Order,
    userId: string,
    t: (k: string) => string,
): OrderAction[] {
    const role: UserRole = userId === order.buyer_id ? "buyer" : "seller";
    const allowed = ORDER_TRANSITIONS[order.status]?.[role] ?? [];

    return allowed.map((type) => ACTION_CONFIG(t)[type]).filter(
        Boolean,
    ) as OrderAction[];
}

/** Is this order still "open"? */
export function isOpenOrder(order: Order): boolean {
    return !["completed", "cancelled"].includes(order.status);
}

// =============================================================================
// Action Visual Config
// =============================================================================

export const ACTION_CONFIG = (
    t: (k: string) => string,
): Record<OrderActionType, OrderAction> => ({
    modify: {
        type: "modify",
        label: t("orders.actions.modify"),
        icon: "Edit3",
        color: colors.amber[700],
        bgColor: colors.amber[100],
    },
    cancel: {
        type: "cancel",
        label: t("orders.actions.cancel"),
        icon: "XCircle",
        color: colors.red[600],
        bgColor: colors.red[100],
        destructive: true,
    },
    accept: {
        type: "accept",
        label: t("orders.actions.accept"),
        icon: "CheckCircle",
        color: colors.green[700],
        bgColor: colors.green[100],
    },
    reject: {
        type: "reject",
        label: t("orders.actions.reject"),
        icon: "XCircle",
        color: colors.red[600],
        bgColor: colors.red[100],
        destructive: true,
    },
    mark_delivered: {
        type: "mark_delivered",
        label: t("orders.actions.markDelivered"),
        icon: "Truck",
        color: "#0369a1",
        bgColor: "#e0f2fe",
    },
    confirm_delivery: {
        type: "confirm_delivery",
        label: t("orders.actions.confirmDelivery"),
        icon: "CheckCircle2",
        color: colors.green[700],
        bgColor: colors.green[100],
    },
    dispute: {
        type: "dispute",
        label: t("orders.actions.dispute"),
        icon: "AlertTriangle",
        color: colors.red[600],
        bgColor: colors.red[100],
        destructive: true,
    },
    make_offer: {
        type: "make_offer",
        label: t("orders.actions.makeOffer"),
        icon: "DollarSign",
        color: colors.amber[700],
        bgColor: colors.amber[100],
    },
    accept_offer: {
        type: "accept_offer",
        label: t("orders.actions.acceptOfferResolve"),
        icon: "CheckCircle",
        color: colors.green[700],
        bgColor: colors.green[100],
    },
    reject_offer: {
        type: "reject_offer",
        label: t("orders.actions.rejectOffer"),
        icon: "XCircle",
        color: colors.red[600],
        bgColor: colors.red[100],
    },
    escalate: {
        type: "escalate",
        label: t("orders.actions.escalate"),
        icon: "ShieldAlert",
        color: "#7c3aed",
        bgColor: "#f3e8ff",
    },
    rate: {
        type: "rate",
        label: t("orders.actions.rate"),
        icon: "Star",
        color: colors.amber[600],
        bgColor: colors.amber[100],
    },
    suggest_date: {
        type: "suggest_date",
        label: "Suggest Date",
        icon: "Calendar",
        color: "#0369a1",
        bgColor: "#e0f2fe",
    },
    suggest_qty: {
        type: "suggest_qty",
        label: "Suggest Qty",
        icon: "Package",
        color: colors.amber[700],
        bgColor: colors.amber[100],
    },
    resolve: {
        type: "resolve",
        label: t("orders.actions.resolve"),
        icon: "CheckCircle",
        color: colors.green[700],
        bgColor: colors.green[100],
    },
});
