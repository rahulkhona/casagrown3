/**
 * send-notification-email — Unified CasaGrown Email Notification Edge Function
 *
 * Handles ALL platform email notifications via a `type` discriminator.
 * Called by DB triggers via net.http_post or directly from other edge functions.
 *
 * Input (POST JSON):
 * {
 *   type: "order_placed" | "offer_made" | "order_delivered" | "order_disputed"
 *         | "dispute_resolved" | "chat_initiated" | "points_purchase"
 *         | "points_redemption" | "points_refund" | "tax_threshold_warning"
 *         | "delegation_revoked" | "delegation_accepted",
 *   payload: { ... event-specific data }
 * }
 */

import {
    jsonError,
    jsonOk,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { sendTransactionEmail } from "../_shared/postmark.ts";
import { wrapInBrandedTemplate, infoCard, actionButton } from "../_shared/email-templates.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:3000";

// =============================================================================
// Types
// =============================================================================

export type EmailType =
    | "order_placed"
    | "offer_made"
    | "order_delivered"
    | "order_disputed"
    | "dispute_resolved"
    | "chat_initiated"
    | "points_purchase"
    | "points_redemption"
    | "points_refund"
    | "tax_threshold_warning"
    | "delegation_revoked"
    | "delegation_accepted"
    | "refund_offer"
    | "rating_reminder"
    | "followed_seller_adds_item"
    | "welcome";

export interface EmailRecipient {
    email: string;
    name?: string;
}

export interface NotificationPayload {
    type: EmailType;
    recipients: EmailRecipient[];
    // Common fields
    product?: string;
    quantity?: number;
    unit?: string;
    pointsPerUnit?: number;
    // Parties
    buyerName?: string;
    buyerEmail?: string;
    sellerName?: string;
    sellerEmail?: string;
    // Order fields
    orderId?: string;
    orderDate?: string;
    subtotal?: number;
    tax?: number;
    total?: number;
    // Offer fields
    offerMessage?: string;
    deliveryDate?: string;
    // Dispute fields
    disputeReason?: string;
    resolutionOutcome?: string;
    refundAmount?: number;
    // Chat fields
    senderName?: string;
    messagePreview?: string;
    // Points fields
    dollarAmount?: number;
    pointsAmount?: number;
    paymentMethodLast4?: string;
    redemptionMethod?: string;
    redemptionRecipient?: string;
    refundReason?: string;
    // Points return (refund to card) fields
    cardLast4?: string;
    cardBrand?: string;
    refundUsdAmount?: number;
    refundFeeCents?: number;
    // Gift card redemption fields
    giftCardUrl?: string;
    giftCardBrand?: string;
    giftCardFaceValue?: number;
    // Tax threshold fields
    ytdEarnings?: number;
    stateThreshold?: number;
    stateName?: string;
    taxYear?: number;
    // Delegation fields
    delegateName?: string;
    delegatorName?: string;
    delegatePct?: number;
    revokedBy?: string;
}

// =============================================================================
// Handler
// =============================================================================

serveWithCors(async (req, { corsHeaders, env }) => {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    const isServiceRole = token === env("SUPABASE_SERVICE_ROLE_KEY");

    if (!isServiceRole) {
        return jsonError(
            "Unauthorized — service_role required",
            corsHeaders,
            401,
        );
    }

    const payload = await req.json() as NotificationPayload;

    if (!payload?.type || !payload?.recipients?.length) {
        return jsonError(
            "Missing type or recipients",
            corsHeaders,
            400,
        );
    }

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const recipient of payload.recipients) {
        const rendered = renderEmailByType(payload, recipient);
        if (!rendered) {
            results.push({
                email: recipient.email,
                success: false,
                error: `Unknown email type: ${payload.type}`,
            });
            continue;
        }

        const result = await sendTransactionEmail({
            to: recipient.email,
            subject: rendered.subject,
            htmlBody: rendered.htmlBody,
        });

        results.push({
            email: recipient.email,
            success: result.success,
            error: result.error,
        });
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(
        `📧 Notification [${payload.type}]: sent=${sent}, failed=${failed}`,
    );

    return jsonOk({ type: payload.type, sent, failed, results }, corsHeaders);
});

// =============================================================================
// Type Dispatcher
// =============================================================================

export function renderEmailByType(
    payload: NotificationPayload,
    recipient: EmailRecipient,
): { subject: string; htmlBody: string } | null {
    switch (payload.type) {
        case "order_placed":
            return renderOrderPlaced(payload, recipient);
        case "offer_made":
            return renderOfferMade(payload, recipient);
        case "order_disputed":
            return renderOrderDisputed(payload, recipient);
        case "order_delivered":
            return renderOrderDelivered(payload, recipient);
        case "refund_offer":
            return renderRefundOffer(payload, recipient);
        case "rating_reminder":
            return renderRatingReminder(payload, recipient);
        case "followed_seller_adds_item":
            return renderFollowedSellerAddsItem(payload, recipient);
        case "welcome":
            return renderWelcomeEmail(payload, recipient);
        case "dispute_resolved":
            return renderDisputeResolved(payload, recipient);
        case "chat_initiated":
            return renderChatInitiated(payload, recipient);
        case "points_purchase":
            return renderPointsPurchase(payload, recipient);
        case "points_redemption":
            return renderPointsRedemption(payload, recipient);
        case "points_refund":
            return renderPointsRefund(payload, recipient);
        case "tax_threshold_warning":
            return renderTaxThresholdWarning(payload, recipient);
        case "delegation_revoked":
            return renderDelegationRevoked(payload, recipient);
        case "delegation_accepted":
            return renderDelegationAccepted(payload, recipient);
        default:
            return null;
    }
}

// =============================================================================
// (a) Order Placed
// =============================================================================

function renderOrderPlaced(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const isBuyer = r.email === p.buyerEmail;
    const subject = isBuyer
        ? `Order Placed — ${p.product} | CasaGrown`
        : `New Order — ${p.product} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    let bodyHtml: string;
    if (isBuyer) {
        bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
Your order for <strong>${p.quantity} ${
            p.unit || ""
        } of ${p.product}</strong> has been placed successfully.
The seller will be notified and will prepare your order for delivery.
</p>
${
            infoCard([
                { label: "Product", value: p.product || "N/A" },
                {
                    label: "Quantity",
                    value: `${p.quantity || 0} ${p.unit || ""}`,
                },
                { label: "Total", value: `${p.total || p.subtotal || 0} pts` },
                { label: "Seller", value: p.sellerName || "N/A" },
            ])
        }
${actionButton("View Order", `${SITE_URL}/orders`)}`;
    } else {
        bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
Great news! <strong>${p.buyerName || "A buyer"}</strong> has placed an order for
<strong>${p.quantity} ${p.unit || ""} of ${p.product}</strong>.
Please prepare the order for delivery.
</p>
${
            infoCard([
                { label: "Product", value: p.product || "N/A" },
                {
                    label: "Quantity",
                    value: `${p.quantity || 0} ${p.unit || ""}`,
                },
                { label: "Total", value: `${p.total || p.subtotal || 0} pts` },
                { label: "Buyer", value: p.buyerName || "N/A" },
            ])
        }
${actionButton("View Order", `${SITE_URL}/orders`)}`;
    }

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: isBuyer ? "Order Confirmation" : "New Order Received",
            greeting,
            bodyHtml,
        }),
    };
}

// =============================================================================
// (b) Offer Made
// =============================================================================

function renderOfferMade(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `New Offer on Your Post — ${p.product} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
<strong>${
        p.sellerName || "A seller"
    }</strong> has made an offer on your post for <strong>${p.product}</strong>.
Review the details and decide whether to accept.
</p>
${
        infoCard([
            { label: "Product", value: p.product || "N/A" },
            { label: "Quantity", value: `${p.quantity || 0} ${p.unit || ""}` },
            {
                label: "Price",
                value: `${p.pointsPerUnit || 0} pts/${p.unit || "unit"}`,
            },
            {
                label: "Total",
                value: `${(p.quantity || 0) * (p.pointsPerUnit || 0)} pts`,
            },
            ...(p.deliveryDate
                ? [{ label: "Delivery Date", value: p.deliveryDate }]
                : []),
            { label: "From", value: p.sellerName || "N/A" },
        ])
    }
${
        p.offerMessage
            ? `<p style="margin: 16px 0 0; font-size: 13px; color: #666666; line-height: 1.5; padding: 12px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #22c55e;"><em>"${p.offerMessage}"</em></p>`
            : ""
    }
${actionButton("Review Offer", `${SITE_URL}/offers`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "New Offer Received",
            greeting,
            bodyHtml,
        }),
    };
}

// =============================================================================
// (d) Order Disputed
// =============================================================================

function renderOrderDisputed(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `Order Disputed — ${p.product} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
An order for <strong>${p.product}</strong> has been disputed.
Please review the details and respond in the order chat.
</p>
${
        infoCard([
            { label: "Product", value: p.product || "N/A" },
            {
                label: "Order ID",
                value: p.orderId ? p.orderId.substring(0, 8) + "..." : "N/A",
            },
            ...(p.disputeReason
                ? [{ label: "Reason", value: p.disputeReason }]
                : []),
        ])
    }
<p style="margin: 16px 0 0; font-size: 13px; color: #b45309; line-height: 1.5;">
⚠️ Please respond promptly to resolve this dispute. You can communicate through the order chat.
</p>
${actionButton("View Dispute", `${SITE_URL}/orders`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Order Disputed",
            greeting,
            bodyHtml,
        }),
    };
}

// =============================================================================
// (e) Dispute Resolved
// =============================================================================

function renderDisputeResolved(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `Dispute Resolved — ${p.product} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const discountRow = p.refundAmount
        ? [{ label: "Discount Applied", value: `${p.refundAmount} pts` }]
        : [];

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
The dispute for your order of <strong>${p.product}</strong> has been resolved.
</p>
${
        infoCard([
            { label: "Product", value: p.product || "N/A" },
            {
                label: "Order ID",
                value: p.orderId ? p.orderId.substring(0, 8) + "..." : "N/A",
            },
            { label: "Resolution", value: p.resolutionOutcome || "Resolved" },
            ...discountRow,
        ])
    }
<p style="margin: 16px 0 0; font-size: 13px; color: #15803d; line-height: 1.5;">
✅ This dispute has been closed. Thank you for your patience.
</p>
${actionButton("View Order", `${SITE_URL}/orders`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Dispute Resolved",
            greeting,
            bodyHtml,
        }),
    };
}

// =============================================================================
// (f) Chat Initiated
// =============================================================================

function renderChatInitiated(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `${p.senderName || "Someone"} sent you a message${
        p.product ? ` about ${p.product}` : ""
    } | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
<strong>${
        p.senderName || "A user"
    }</strong> has started a conversation with you${
        p.product ? ` about <strong>${p.product}</strong>` : ""
    }.
</p>
${
        p.messagePreview
            ? `<div style="margin: 0 0 16px; padding: 12px 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #22c55e;">
<p style="margin: 0; font-size: 13px; color: #374151; line-height: 1.5;"><em>"${
                p.messagePreview.length > 150
                    ? p.messagePreview.substring(0, 150) + "..."
                    : p.messagePreview
            }"</em></p>
</div>`
            : ""
    }
${actionButton("Reply in Chat", `${SITE_URL}/chats`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "New Message",
            greeting,
            bodyHtml,
        }),
    };
}

// =============================================================================
// (g) Points Purchase
// =============================================================================

function renderPointsPurchase(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `Payment Confirmation — ${
        p.pointsAmount || 0
    } Points Purchased | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
Your point purchase has been completed successfully. Here's your receipt.
</p>
${
        infoCard([
            { label: "Points Purchased", value: `${p.pointsAmount || 0} pts` },
            {
                label: "Amount Charged",
                value: `$${(p.dollarAmount || 0).toFixed(2)}`,
            },
            ...(p.paymentMethodLast4
                ? [{
                    label: "Payment Method",
                    value: `•••• ${p.paymentMethodLast4}`,
                }]
                : []),
            {
                label: "Date",
                value: new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                }),
            },
        ])
    }
${actionButton("View Balance", `${SITE_URL}/buy-points`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Payment Receipt",
            greeting,
            bodyHtml,
            footer:
                "This receipt is for your records. Points are non-refundable once used.",
        }),
    };
}

// =============================================================================
// (h) Points Redemption
// =============================================================================

function renderPointsRedemption(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const method = p.redemptionMethod || "cashout";
    const isGiftCard = method.toLowerCase().includes("gift card") ||
        !!p.giftCardUrl;
    const brand = p.giftCardBrand || method;
    const faceValue = p.giftCardFaceValue || p.dollarAmount || 0;

    const subject = isGiftCard
        ? `Redeemed: ${brand} $${faceValue.toFixed(0)} Gift Card | CasaGrown`
        : `Redemption Confirmed — ${method} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    let bodyHtml: string;

    if (isGiftCard) {
        // Gift card redemption — include link to gift card + transaction log
        bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
Your gift card redemption has been completed. Here are your details.
</p>
${
            infoCard([
                {
                    label: "Gift Card",
                    value: `${brand} $${faceValue.toFixed(0)}`,
                },
                {
                    label: "Points Redeemed",
                    value: `${p.pointsAmount || 0} pts`,
                },
                {
                    label: "Date",
                    value: new Date().toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                    }),
                },
            ])
        }
${
            p.giftCardUrl
                ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 20px;">
<tr><td align="center">
<a href="${p.giftCardUrl}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #7c3aed, #a855f7); color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
🎁 View Your Gift Card
</a>
</td></tr>
</table>`
                : ""
        }
${actionButton("View Transaction History", `${SITE_URL}/transaction-history`)}`;
    } else {
        // Venmo / PayPal cashout
        bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
Your cashout to <strong>${method}</strong> has been processed successfully.
</p>
${
            infoCard([
                {
                    label: "Points Redeemed",
                    value: `${p.pointsAmount || 0} pts`,
                },
                {
                    label: "Cashout Amount",
                    value: `$${(p.dollarAmount || 0).toFixed(2)}`,
                },
                { label: "Method", value: method },
                ...(p.redemptionRecipient
                    ? [{ label: "Sent To", value: p.redemptionRecipient }]
                    : []),
                {
                    label: "Date",
                    value: new Date().toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                    }),
                },
            ])
        }
${actionButton("View Transaction History", `${SITE_URL}/transaction-history`)}`;
    }

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: isGiftCard ? "Gift Card Redeemed" : "Cashout Receipt",
            greeting,
            bodyHtml,
        }),
    };
}

// =============================================================================
// (k) Points Return (Money refunded back to card)
// =============================================================================

function renderPointsRefund(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const cardInfo = p.cardLast4
        ? `${p.cardBrand || "Card"} ending in ${p.cardLast4}`
        : null;
    const subject = cardInfo
        ? `Refund to ${cardInfo} | CasaGrown`
        : `Points Return — ${p.pointsAmount || 0} pts | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
${
        cardInfo
            ? `Your refund has been processed back to your <strong>${cardInfo}</strong>.`
            : "Your points return has been processed."
    }
</p>
${
        infoCard([
            { label: "Points Returned", value: `${p.pointsAmount || 0} pts` },
            ...(p.refundUsdAmount != null
                ? [{
                    label: "Refund Amount",
                    value: `$${p.refundUsdAmount.toFixed(2)}`,
                }]
                : []),
            ...(p.refundFeeCents != null
                ? [{
                    label: "Processing Fee",
                    value: `$${(p.refundFeeCents / 100).toFixed(2)}`,
                }]
                : []),
            ...(cardInfo ? [{ label: "Refunded To", value: cardInfo }] : []),
            ...(p.refundReason
                ? [{ label: "Reason", value: p.refundReason }]
                : []),
            {
                label: "Date",
                value: new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                }),
            },
        ])
    }
${actionButton("View Transaction History", `${SITE_URL}/transaction-history`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: cardInfo ? "Refund Processed" : "Points Returned",
            greeting,
            bodyHtml,
            footer: cardInfo
                ? "Refunds typically take 5-10 business days to appear on your statement."
                : undefined,
        }),
    };
}

// =============================================================================
// (l) Tax Threshold Warning (1099-K)
// =============================================================================

function renderTaxThresholdWarning(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `Important Tax Information — Your CasaGrown Earnings`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
Your CasaGrown seller earnings for <strong>${
        p.taxYear || new Date().getFullYear()
    }</strong> have reached
<strong>$${(p.ytdEarnings || 0).toLocaleString()}</strong>.
</p>
<div style="margin: 0 0 16px; padding: 16px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 10px;">
<p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.6;">
<strong>⚠️ Tax Notice:</strong> In <strong>${
        p.stateName || "your state"
    }</strong>,
CasaGrown is required to issue a <strong>Form 1099-K</strong> when annual seller earnings reach
<strong>$${(p.stateThreshold || 20000).toLocaleString()}</strong>.
Please consult a tax professional for guidance on reporting requirements.
</p>
</div>
<p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
Please ensure your profile information (name, address, SSN/TIN) is accurate and up to date.
</p>
${actionButton("Update Profile", `${SITE_URL}/profile`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Tax Information",
            greeting,
            bodyHtml,
            footer:
                "This is an informational notice. CasaGrown does not provide tax advice. Please consult a qualified tax professional.",
        }),
    };
}

// =============================================================================
// (m) Delegation Revoked
// =============================================================================

function renderDelegationRevoked(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const otherParty = r.email === p.buyerEmail
        ? p.sellerName
        : (p.revokedBy === "delegator" ? p.delegatorName : p.delegateName);
    const subject = `Delegation Ended — ${otherParty || "Partner"} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
The delegation relationship ${
        p.revokedBy === "delegator"
            ? `from <strong>${
                p.delegatorName || "the delegator"
            }</strong> has been ended`
            : `with <strong>${
                p.delegateName || "the delegate"
            }</strong> has been ended`
    }.
</p>
${
        infoCard([
            { label: "Delegator", value: p.delegatorName || "N/A" },
            { label: "Delegate", value: p.delegateName || "N/A" },
            {
                label: "Ended By",
                value: p.revokedBy === "delegator" ? "Delegator" : "Delegate",
            },
            {
                label: "Date",
                value: new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                }),
            },
        ])
    }
<p style="margin: 16px 0 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
Any active posts created under this delegation will remain visible until they expire or are removed.
</p>
${actionButton("View Delegations", `${SITE_URL}/delegate`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Delegation Ended",
            greeting,
            bodyHtml,
        }),
    };
}

// =============================================================================
// (n) Delegation Accepted
// =============================================================================

function renderDelegationAccepted(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `Delegation Accepted — ${
        p.delegateName || "Your delegate"
    } is now selling for you | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const delegatorPct = 100 - (p.delegatePct || 0);

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
Great news! <strong>${
        p.delegateName || "Your delegate"
    }</strong> has accepted your delegation request
and can now sell on your behalf.
</p>
${
        infoCard([
            { label: "Delegate", value: p.delegateName || "N/A" },
            { label: "Delegate's Share", value: `${p.delegatePct || 0}%` },
            { label: "Your Share", value: `${delegatorPct}%` },
            {
                label: "Date",
                value: new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                }),
            },
        ])
    }
${actionButton("Manage Delegations", `${SITE_URL}/delegate`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Delegation Accepted",
            greeting,
            bodyHtml,
        }),
    };
}

// =============================================================================
// (o) Order Delivered, Rating, Refund, Followers (Extrapolated from Design)
// =============================================================================

function renderOrderDelivered(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `Order Delivered — ${p.product} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:16px 0;">
  <p style="color:#166534; font-size:16px; margin:0; font-weight:600">🚚 Your Order Has Been Delivered!</p>
  <p style="color:#374151; font-size:13px; margin:8px 0 0;">
    <strong>${p.product}</strong> from ${p.sellerName || 'your seller'} has been delivered. Please confirm receipt to complete the transaction.
  </p>
</div>
<div style="margin-top: 16px;">
  <a href="${SITE_URL}/orders" style="display:inline-block; background:#16a34a; color:white; padding:10px 24px; border-radius:12px; text-decoration:none; font-weight:600; font-size:14px;">Confirm Delivery</a>
  <a href="${SITE_URL}/orders" style="display:inline-block; background:#dc2626; color:white; padding:10px 24px; border-radius:12px; text-decoration:none; font-weight:600; font-size:14px; margin-left:8px;">Report Issue</a>
</div>
`;
    return {
        subject,
        htmlBody: wrapInBrandedTemplate({ title: "Order Delivered", greeting, bodyHtml }),
    };
}

function renderRefundOffer(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `Refund Offer Received — ${p.product} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;
    
    // Uses the amber yellow gradient styling
    const bodyHtml = `
<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:16px; margin:16px 0;">
  <p style="color:#92400e; font-size:16px; margin:0; font-weight:600">💵 Refund Offer Received</p>
  <p style="color:#374151; font-size:13px; margin:8px 0 0;">
    ${p.sellerName || 'The seller'} has offered a <strong>$${(p.refundAmount || 0).toFixed(2)} partial refund</strong> to resolve your issue with <strong>${p.product}</strong>.
  </p>
</div>
<div style="margin-top: 16px;">
  <a href="${SITE_URL}/orders" style="display:inline-block; background:#16a34a; color:white; padding:10px 24px; border-radius:12px; text-decoration:none; font-weight:600; font-size:14px;">Accept Offer</a>
  <a href="${SITE_URL}/orders" style="display:inline-block; background:#4b5563; color:white; padding:10px 24px; border-radius:12px; text-decoration:none; font-weight:600; font-size:14px; margin-left:8px;">Decline</a>
</div>
`;
    return {
        subject,
        htmlBody: wrapInBrandedTemplate({ 
            title: "Refund Offer", 
            greeting, 
            bodyHtml,
            headerGradient: "linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)",
            headerTextColor: "#ffffff"
        }),
    };
}

function renderRatingReminder(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `Rate Your Recent Transaction | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;
    
    const bodyHtml = `
<div style="background:#e0f2fe; border:1px solid #bae6fd; border-radius:12px; padding:16px; margin:16px 0; text-align:center;">
  <p style="font-size:32px; margin:0;">⭐⭐⭐⭐⭐</p>
  <p style="color:#1e40af; font-size:16px; margin:8px 0; font-weight:600">How was your order?</p>
  <p style="color:#374151; font-size:13px; margin:0;">
    Rate your purchase of <strong>${p.product}</strong> from <strong>${p.sellerName}</strong>
  </p>
  <div style="margin-top:12px;">
    <a href="${SITE_URL}/orders" style="display:inline-block; background:#d97706; color:white; padding:10px 24px; border-radius:12px; text-decoration:none; font-weight:600; font-size:14px; margin:4px;">Rate Now</a>
    <a href="${SITE_URL}/orders" style="display:inline-block; background:#4b5563; color:white; padding:10px 24px; border-radius:12px; text-decoration:none; font-weight:600; font-size:14px; margin:4px;">Skip</a>
  </div>
</div>
`;
    return {
        subject,
        htmlBody: wrapInBrandedTemplate({ title: "Rate Transaction", greeting, bodyHtml }),
    };
}

function renderFollowedSellerAddsItem(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `${p.sellerName} Added New Items! | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;
    
    const bodyHtml = `
<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:16px 0;">
  <p style="color:#166534; font-size:16px; margin:0; font-weight:600">🌱 ${p.sellerName} Added New Items!</p>
  <p style="color:#374151; font-size:13px; margin:8px 0 0;">
    <strong>${p.product}</strong> — ${p.pointsPerUnit} pts/${p.unit}
  </p>
</div>
${actionButton("View Booth", `${SITE_URL}/market`)}
`;
    return {
        subject,
        htmlBody: wrapInBrandedTemplate({ title: "New Item Available", greeting, bodyHtml }),
    };
}

// =============================================================================
// (t) Welcome Email
// =============================================================================

function renderWelcomeEmail(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = "🏡 You're in! Welcome to your hyper-local neighborhood market.";
    const greeting = r.name ? `Hi ${r.name},` : "Hi there,";

    // Rely on SITE_URL for absolute image path
    const heroImage = `${SITE_URL}/emails/welcome-hero.png`;

    const bodyHtml = \`
<div style="text-align: center; margin-bottom: 32px;">
  <img src="\${heroImage}" alt="Thank You" style="width: 100%; max-width: 600px; border-radius: 12px; margin-bottom: 24px;" />
</div>

<p style="margin: 0 0 16px; font-size: 16px; color: #374151; line-height: 1.6;">
  I wanted to personally reach out and welcome you to CasaGrown! Thank you for joining our hyper-local community and for being an essential part of our mission to revolutionize the way neighborhoods share food.
</p>

<p style="margin: 0 0 16px; font-size: 16px; color: #374151; line-height: 1.6;">
  By participating in CasaGrown, you are directly helping us reduce produce waste, make fresh and healthy food more accessible for all our neighbors, and convert backyard waste into real savings.
</p>

<h3 style="margin: 32px 0 12px; font-size: 18px; color: #111827;">Explore the Platform Highlights 🌟</h3>
<p style="margin: 0 0 12px; font-size: 15px; color: #4b5563; line-height: 1.6;">
  As you get settled, we encourage you to try out some of our favorite novelties:
</p>
<ul style="margin: 0 0 24px; padding-left: 20px; font-size: 15px; color: #4b5563; line-height: 1.6;">
  <li><strong>The Gardening Community</strong>: Connect with local growers, share harvests, and swap stories.</li>
  <li><strong>CasaBot AI Assistant</strong>: Your personalized gardening companion! Ask CasaBot for hyper-local gardening tips, planting schedules, and harvesting advice.</li>
</ul>

<h3 style="margin: 32px 0 12px; font-size: 18px; color: #111827;">Your Safety is our Top Priority 🔒</h3>
<p style="margin: 0 0 12px; font-size: 15px; color: #4b5563; line-height: 1.6;">
  We designed CasaGrown to keep your private information secure. 
  <strong>Your address is never shared publicly.</strong> It is strictly only revealed to sellers when they are actively delivering your order, or to buyers when you approve them for a local pickup.
</p>
<ul style="margin: 0 0 24px; padding-left: 20px; font-size: 15px; color: #4b5563; line-height: 1.6;">
  <li><strong>Custom Pickup Locations</strong>: Prefer to meet at a nearby park or cafe? You can always set custom pickup spots.</li>
  <li><strong>Touchless Delivery</strong>: Sellers can securely drop off produce at your door without any physical interaction.</li>
</ul>

<h3 style="margin: 32px 0 12px; font-size: 18px; color: #111827;">Market Netting (Keep Your Cash) 💸</h3>
<p style="margin: 0 0 24px; font-size: 15px; color: #4b5563; line-height: 1.6;">
  We've built a unified economy! With our advanced <strong>Market Netting</strong> feature, your balances are automatically settled across the platform. You only ever pay the difference between the produce you sell and the produce you buy.
</p>

<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; margin-top: 32px; text-align: center;">
  <h3 style="margin: 0 0 12px; font-size: 18px; color: #166534;">Invite Your Neighbors! 🏡</h3>
  <p style="margin: 0 0 20px; font-size: 15px; color: #15803d; line-height: 1.6;">
    CasaGrown thrives on local network effects. As the size of our community grows, everyone benefits! A larger neighborhood means more delicious, fresh options available to buy, and significantly higher demand to quickly sell any excess produce you might have.
  </p>
  \${actionButton("Invite Your Neighbors Today", \`\${SITE_URL}/community?share=true&utm_source=welcome_email&utm_medium=email&utm_campaign=onboarding\`)}
</div>

<p style="margin: 32px 0 0; font-size: 16px; color: #374151; line-height: 1.6;">
  Welcome home,<br>
  <strong>Rahul Khona</strong><br>
  Founder, CasaGrown
</p>
\`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Welcome to CasaGrown!",
            greeting,
            bodyHtml,
        }),
    };
}
