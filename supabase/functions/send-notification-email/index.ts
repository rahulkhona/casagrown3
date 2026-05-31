/**
 * send-notification-email - Unified CasaGrown Email Notification Edge Function
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

// Safety guard: never use localhost URLs in production emails.
// If Postmark token is set (production), always use the real domain.
const _rawSiteUrl = Deno.env.get("SITE_URL") ?? "https://www.casagrown.com";
const SITE_URL = (
  _rawSiteUrl.includes("localhost") && Deno.env.get("POSTMARK_SERVER_TOKEN")
) ? "https://www.casagrown.com" : _rawSiteUrl;

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
    | "welcome"
    | "abandoned_tos"
    | "abandoned_profile"
    | "credit_granted"
    | "credit_expiring"
    | "credit_expired"
    | "card_hold_placed"
    | "card_charged"
    | "order_cancelled_seller"
    | "capture_failed"
    | "dispute_closed"
    | "subscription_receipt"
    | "stripe_connect_onboarded"
    | "stripe_connect_transfer_failed"
    | "stripe_connect_transfer_success"
    | "subscription_change";

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
    // Credit fields
    creditAmountUsd?: number;
    creditType?: string;       // 'purchase' | 'platform_fee' | 'universal'
    creditReason?: string;
    creditCapValue?: number;
    creditCapType?: string;    // 'percentage' | 'flat_amount'
    creditExpiresAt?: string;
    creditUsageRules?: string; // pre-built human-readable rules from DB
    creditRemainingUsd?: number;
    creditDaysLeft?: number;
    // Card / payment fields
    holdAmountUsd?: number;
    chargeAmountUsd?: number;
    // Dispute closed fields
    disputeWon?: boolean;
    disputeFeeUsd?: number;
    // Subscription receipt fields
    subscriptionData?: {
        planName: string;
        amount: number;
        date: string;
        invoiceId: string;
        invoiceUrl?: string | null;
        periodStart?: string | null;
        periodEnd?: string | null;
    };
    stripeTransferId?: string;
    errorMessage?: string;
    plan?: string;
    action?: string;
    waNumber?: string | null;
}

// =============================================================================
// Handler
// =============================================================================

serveWithCors(async (req, { supabase, corsHeaders, env }) => {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    const isServiceRole = token === env("SUPABASE_SERVICE_ROLE_KEY");

    if (!isServiceRole) {
        return jsonError(
            "Unauthorized - service_role required",
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
        if (payload.type === 'subscription_change') {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', recipient.email)
              .maybeSingle();
            if (profile?.id) {
              const { data: fbConn } = await supabase
                .from('seller_fb_connections')
                .select('wa_display_phone')
                .eq('user_id', profile.id)
                .eq('status', 'connected')
                .maybeSingle();
              if (fbConn?.wa_display_phone) {
                payload.waNumber = fbConn.wa_display_phone;
              }
            }
        }
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
        case "abandoned_tos":
            return renderAbandonedTosEmail(payload, recipient);
        case "abandoned_profile":
            return renderAbandonedProfileEmail(payload, recipient);
        case "points_refund":
            return renderPointsRefund(payload, recipient);
        case "tax_threshold_warning":
            return renderTaxThresholdWarning(payload, recipient);
        case "delegation_revoked":
            return renderDelegationRevoked(payload, recipient);
        case "delegation_accepted":
            return renderDelegationAccepted(payload, recipient);
        case "credit_granted":
            return renderCreditGranted(payload, recipient);
        case "credit_expiring":
            return renderCreditExpiring(payload, recipient);
        case "credit_expired":
            return renderCreditExpired(payload, recipient);
        case "card_hold_placed":
            return renderCardHoldPlaced(payload, recipient);
        case "card_charged":
            return renderCardCharged(payload, recipient);
        case "order_cancelled_seller":
            return renderOrderCancelledSeller(payload, recipient);
        case "capture_failed":
            return renderCaptureFailed(payload, recipient);
        case "dispute_closed":
            return renderDisputeClosed(payload, recipient);
        case "subscription_receipt":
            return renderSubscriptionReceipt(payload, recipient);
        case "stripe_connect_onboarded":
            // Simple acknowledgment — reuse welcome-style template
            return {
                subject: "Stripe Connected — Direct Deposits Active | CasaGrown",
                htmlBody: wrapInBrandedTemplate({
                    title: "Stripe Connected",
                    greeting: `Hi ${recipient.name || "there"},`,
                    bodyHtml: `<p>Your Stripe account has been successfully linked. All future settlements will deposit directly to your bank account.</p>`,
                }),
            };
        case "stripe_connect_transfer_success":
            return renderStripeConnectTransferSuccess(payload, recipient);
        case "stripe_connect_transfer_failed":
            return renderStripeConnectTransferFailed(payload, recipient);
        case "subscription_change":
            return renderSubscriptionChange(payload, recipient);
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
        ? `Order Placed - ${p.product} | CasaGrown`
        : `New Order - ${p.product} | CasaGrown`;
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
    const subject = `New Offer on Your Post - ${p.product} | CasaGrown`;
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
    const subject = `Order Disputed - ${p.product} | CasaGrown`;
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
    const subject = `Dispute Resolved - ${p.product} | CasaGrown`;
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
    const subject = `Payment Confirmation - ${
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
        : `Redemption Confirmed - ${method} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    let bodyHtml: string;

    if (isGiftCard) {
        // Gift card redemption - include link to gift card + transaction log
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
        : `Points Return - ${p.pointsAmount || 0} pts | CasaGrown`;
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
    const subject = `Important Tax Information - Your CasaGrown Earnings`;
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
    const subject = `Delegation Ended - ${otherParty || "Partner"} | CasaGrown`;
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
    const subject = `Delegation Accepted - ${
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
    const subject = `Order Delivered - ${p.product} | CasaGrown`;
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
    const subject = `Refund Offer Received - ${p.product} | CasaGrown`;
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
    <strong>${p.product}</strong> - ${p.pointsPerUnit} pts/${p.unit}
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

    const bodyHtml = `
<div style="text-align: center; margin-bottom: 32px;">
  <img src="${heroImage}" alt="Thank You" style="width: 100%; max-width: 600px; border-radius: 12px; margin-bottom: 24px;" />
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
  ${actionButton("Invite Your Neighbors Today", `${SITE_URL}/community?share=true&utm_source=welcome_email&utm_medium=email&utm_campaign=onboarding`)}
</div>

<p style="margin: 32px 0 0; font-size: 16px; color: #374151; line-height: 1.6;">
  Welcome home,<br>
  <strong>Rahul Khona</strong><br>
  Founder, CasaGrown
</p>
`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Welcome to CasaGrown!",
            greeting,
            bodyHtml,
        }),
    };
}

// =============================================================================
// (u) Abandoned Onboarding - ToS
// =============================================================================

function renderAbandonedTosEmail(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = "You're almost there! One last step to join your community";
    const greeting = r.name ? "Hi " + r.name + "," : "Hi there,";

    const heroImage = `${SITE_URL}/emails/tos-hero.png`;

    const bodyHtml = `
<div style="text-align: center; margin-bottom: 32px;">
  <img src="${heroImage}" alt="Handshake over neighborhood" style="width: 100%; max-width: 600px; border-radius: 12px; margin-bottom: 24px;" />
</div>

<p style="margin: 0 0 16px; font-size: 16px; color: #374151; line-height: 1.6;">
  We noticed you stopped exploring right before finalizing your account. We get it—reading terms isn't exactly the most fun part of the day!
</p>

<p style="margin: 0 0 24px; font-size: 16px; color: #374151; line-height: 1.6;">
  Our Terms of Service are simply built to guarantee a secure, trusted ecosystem where neighbors know exactly who they are dealing with. Your address is always kept strictly private, and CasaGrown protects every transaction. Complete your setup today to explore the platform safely.
</p>

<div style="text-align: center; margin: 32px 0;">
  ${actionButton("Complete Registration", `${SITE_URL}/onboarding`)}
</div>

<p style="margin: 32px 0 0; font-size: 16px; color: #374151; line-height: 1.6;">
  Warmly,<br>
  <strong>The CasaGrown Team</strong>
</p>
`;
    return {
        subject,
        htmlBody: wrapInBrandedTemplate({ title: "Finish Setup", greeting, bodyHtml }),
    };
}

// =============================================================================
// (v) Abandoned Onboarding - Profile/Community Setup
// =============================================================================

function renderAbandonedProfileEmail(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = "Your neighbors are waiting! Complete your profile";
    const greeting = r.name ? "Hi " + r.name + "," : "Hi there,";

    const heroImage = `${SITE_URL}/emails/profile-hero.png`;

    const bodyHtml = `
<div style="text-align: center; margin-bottom: 32px;">
  <img src="${heroImage}" alt="CasaGrown Value Propositions" style="width: 100%; max-width: 600px; border-radius: 12px; margin-bottom: 24px;" />
</div>

<p style="margin: 0 0 16px; font-size: 16px; color: #374151; line-height: 1.6;">
  Your neighbors are already trading! We noticed you registered but haven't found your local community block yet. CasaGrown relies on authentic, hyper-local connections, and until you set your home location, your neighborhood market remains hidden.
</p>

<p style="margin: 0 0 16px; font-size: 16px; color: #374151; line-height: 1.6;">
  By joining your community, you'll be part of a massive movement to stop the 11.5 billion pounds of backyard produce wasted every year, all while putting the absolute freshest food directly on your family's table.
</p>

<p style="margin: 0 0 16px; font-size: 16px; color: #374151; line-height: 1.6;">
  Plus, did you know that actively sharing your own backyard extras—from fresh lemons to homegrown herbs—is estimated to put up to <strong>$800 a year</strong> in extra cash back into your pocket? Instead of letting that extra harvest fall to the ground and go entirely to waste every year, you can seamlessly convert it into real value for your community.
</p>

<p style="margin: 0 0 24px; font-size: 16px; color: #374151; line-height: 1.6;">
  You've already done the hard part by signing up. Set your location today so your neighbors know you're here and ready to swap!
</p>

<div style="text-align: center; margin: 32px 0;">
  ${actionButton("Find My Community", `${SITE_URL}/community`)}
</div>

<p style="margin: 32px 0 0; font-size: 16px; color: #374151; line-height: 1.6;">
  Warmly,<br>
  <strong>The CasaGrown Team</strong>
</p>
`;
    return {
        subject,
        htmlBody: wrapInBrandedTemplate({ title: "Find Your Community", greeting, bodyHtml }),
    };
}

// =============================================================================
// (s) Credit Granted
// =============================================================================

function renderCreditGranted(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const amount = p.creditAmountUsd || 0;
    const creditType = p.creditType || "purchase";
    const subject = `💰 You received $${amount.toFixed(2)} in CasaGrown credits!`;
    const greeting = `Hi ${r.name || "there"},`;

    // Build usage explanation based on credit_type
    let usageExplain: string;
    if (creditType === "purchase") {
        usageExplain = "This credit applies toward your <strong>purchases as a buyer</strong>. It will be automatically deducted from your order total at checkout.";
    } else if (creditType === "platform_fee") {
        usageExplain = "This credit reduces your <strong>seller platform fees</strong>. It will be automatically applied when your sales are settled.";
    } else if (creditType === "universal") {
        usageExplain = "This credit can be used toward <strong>both purchases and seller fees</strong>. It will be automatically applied to your next transaction.";
    } else {
        usageExplain = "This credit will be automatically applied to your transactions.";
    }

    // Build cap explanation
    let capExplain: string;
    const capVal = p.creditCapValue || 0;
    if (p.creditCapType === "percentage") {
        if (creditType === "platform_fee") {
            capExplain = `Up to <strong>${capVal}%</strong> of your platform fees per sale.`;
        } else {
            capExplain = `Up to <strong>${capVal}%</strong> of your order total per transaction.`;
        }
    } else {
        if (creditType === "platform_fee") {
            capExplain = `Up to <strong>$${capVal.toFixed(2)}</strong> off your seller fees per sale.`;
        } else {
            capExplain = `Up to <strong>$${capVal.toFixed(2)}</strong> off your purchase per order.`;
        }
    }

    // Build expiry line
    const expiryLine = p.creditExpiresAt
        ? `Expires: <strong>${new Date(p.creditExpiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>`
        : "No expiration date.";

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
You've been awarded <strong>$${amount.toFixed(2)}</strong> in ${creditType.replace("_", " ")} credits${p.creditReason ? ` - ${p.creditReason}` : ""}.
</p>
${infoCard([
    { label: "Credit Amount", value: `$${amount.toFixed(2)}` },
    { label: "Credit Type", value: creditType.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) },
    { label: "Per-Order Cap", value: p.creditCapType === "percentage" ? `${capVal}%` : `$${capVal.toFixed(2)}` },
    { label: "Expires", value: p.creditExpiresAt ? new Date(p.creditExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never" },
    ...(p.creditReason ? [{ label: "Reason", value: p.creditReason }] : []),
])}
<div style="margin: 16px 0; padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;">
  <p style="margin: 0 0 8px; font-size: 13px; color: #166534; font-weight: 600;">📋 How It Works</p>
  <ul style="margin: 0; padding: 0 0 0 18px; font-size: 12px; color: #374151; line-height: 1.8;">
    <li>${usageExplain}</li>
    <li>${capExplain}</li>
    <li>Only <strong>1 credit</strong> is applied per transaction.</li>
    <li>${expiryLine}</li>
  </ul>
</div>
${actionButton("Shop Now →", `${SITE_URL}/market`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Credits Received!",
            greeting,
            bodyHtml,
            headerEmoji: "💰",
        }),
    };
}

// =============================================================================
// (t) Credit Expiring Soon
// =============================================================================

function renderCreditExpiring(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const remaining = p.creditRemainingUsd || 0;
    const daysLeft = p.creditDaysLeft ?? 0;
    const creditType = p.creditType || "purchase";

    const subject = daysLeft === 0
        ? `⏰ Your $${remaining.toFixed(2)} CasaGrown credit expires today!`
        : `⏰ Your $${remaining.toFixed(2)} CasaGrown credit expires in ${daysLeft} day${daysLeft > 1 ? "s" : ""}`;
    const greeting = `Hi ${r.name || "there"},`;

    const urgencyColor = daysLeft === 0 ? "#dc2626" : "#b45309";
    const urgencyBg = daysLeft === 0 ? "#fef2f2" : "#fffbeb";
    const urgencyBorder = daysLeft === 0 ? "#fca5a5" : "#fde68a";
    const urgencyText = daysLeft === 0
        ? "Your credit expires <strong>today</strong>! Use it before midnight or it will be lost."
        : `Your credit expires in <strong>${daysLeft} day${daysLeft > 1 ? "s" : ""}</strong>. Don't let it go to waste!`;

    let usageHint: string;
    if (creditType === "purchase") {
        usageHint = "Use this credit by purchasing fresh produce from your neighbors.";
    } else if (creditType === "platform_fee") {
        usageHint = "This credit will automatically reduce your seller fees on your next sale.";
    } else {
        usageHint = "This credit can be used for purchases or will reduce your seller fees.";
    }

    const bodyHtml = `
<div style="margin: 0 0 16px; padding: 16px; background: ${urgencyBg}; border: 1px solid ${urgencyBorder}; border-radius: 10px;">
  <p style="margin: 0; font-size: 14px; color: ${urgencyColor}; line-height: 1.6;">
    ${urgencyText}
  </p>
</div>
${infoCard([
    { label: "Remaining Balance", value: `$${remaining.toFixed(2)}` },
    { label: "Credit Type", value: creditType.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) },
    { label: "Expires", value: p.creditExpiresAt ? new Date(p.creditExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Today" },
])}
<p style="margin: 16px 0 0; font-size: 13px; color: #374151; line-height: 1.6;">
${usageHint}
</p>
${actionButton(creditType === "platform_fee" ? "View Earnings →" : "Shop Now →", creditType === "platform_fee" ? `${SITE_URL}/earnings` : `${SITE_URL}/market`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: daysLeft === 0 ? "Credit Expires Today!" : "Credit Expiring Soon",
            greeting,
            bodyHtml,
            headerGradient: "linear-gradient(135deg, #b45309 0%, #f59e0b 50%, #fbbf24 100%)",
            headerEmoji: "⏰",
        }),
    };
}

// =============================================================================
// (u) Credit Expired
// =============================================================================

function renderCreditExpired(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const remaining = p.creditRemainingUsd || 0;
    const creditType = p.creditType || "purchase";
    const subject = `❌ Your $${remaining.toFixed(2)} CasaGrown credit has expired`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<div style="margin: 0 0 16px; padding: 16px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 10px;">
  <p style="margin: 0; font-size: 14px; color: #991b1b; line-height: 1.6;">
    Your <strong>$${remaining.toFixed(2)}</strong> ${creditType.replace("_", " ")} credit has expired and can no longer be used.
  </p>
</div>
${infoCard([
    { label: "Expired Amount", value: `$${remaining.toFixed(2)}` },
    { label: "Credit Type", value: creditType.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) },
    { label: "Expired On", value: p.creditExpiresAt ? new Date(p.creditExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Today" },
])}
<p style="margin: 16px 0 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
Keep an eye on your wallet for future credits. You can check your credit balance anytime in the Earnings section.
</p>
${actionButton("View Earnings", `${SITE_URL}/earnings`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Credit Expired",
            greeting,
            bodyHtml,
            headerGradient: "linear-gradient(135deg, #6b7280 0%, #9ca3af 50%, #d1d5db 100%)",
            headerEmoji: "❌",
        }),
    };
}

// =============================================================================
// (v) Card Hold Placed
// =============================================================================

function renderCardHoldPlaced(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const amount = p.holdAmountUsd || p.dollarAmount || 0;
    const subject = `💳 Payment Hold - $${amount.toFixed(2)} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
  A hold of <strong>$${amount.toFixed(2)}</strong> has been placed on your card for your market purchases.
</p>
${infoCard([
    { label: "Hold Amount", value: `$${amount.toFixed(2)}` },
    ...(p.cardLast4 ? [{ label: "Card", value: `•••• ${p.cardLast4}` }] : []),
])}
<div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin: 16px 0;">
  <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.6;">
    <strong>What does this mean?</strong> This is a temporary authorization, not a charge.
    Your card will only be charged at the end of the day during settlement for completed orders.
    Any unused hold amount will be released automatically.
  </p>
</div>
${actionButton("View Earnings", `${SITE_URL}/earnings`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Payment Hold",
            greeting,
            bodyHtml,
            headerEmoji: "💳",
        }),
    };
}

// =============================================================================
// (w) Card Charged (Settlement Capture)
// =============================================================================

function renderCardCharged(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const amount = p.chargeAmountUsd || p.dollarAmount || 0;
    const subject = `💳 Card Charged - $${amount.toFixed(2)} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
  Your card has been charged <strong>$${amount.toFixed(2)}</strong> for your completed market orders.
  This charge reflects the daily settlement of your purchases.
</p>
${infoCard([
    { label: "Charge Amount", value: `$${amount.toFixed(2)}` },
    { label: "Settlement Date", value: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
])}
<p style="margin: 16px 0 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
  You can view a breakdown of all charges in your Earnings section.
</p>
${actionButton("View Earnings", `${SITE_URL}/earnings`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Card Charged",
            greeting,
            bodyHtml,
            headerEmoji: "💳",
        }),
    };
}

// =============================================================================
// (x) Order Cancelled - Seller Notification
// =============================================================================

function renderOrderCancelledSeller(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const subject = `Order Cancelled - ${p.product} | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const bodyHtml = `
<p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
  An order for <strong>${p.quantity || ""} ${p.unit || ""} of ${p.product}</strong>
  has been cancelled.
</p>
${infoCard([
    { label: "Product", value: p.product || "N/A" },
    ...(p.quantity ? [{ label: "Quantity", value: `${p.quantity} ${p.unit || ""}` }] : []),
    ...(p.buyerName ? [{ label: "Buyer", value: p.buyerName }] : []),
])}
<p style="margin: 16px 0 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
  No further action is needed on your part. Your available inventory has been updated.
</p>
${actionButton("View Orders", `${SITE_URL}/orders`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Order Cancelled",
            greeting,
            bodyHtml,
            headerGradient: "linear-gradient(135deg, #6b7280 0%, #9ca3af 50%, #d1d5db 100%)",
            headerEmoji: "🔄",
        }),
    };
}

// =============================================================================
// (y) Capture Failed - Payment Issue
// =============================================================================

function renderCaptureFailed(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const amount = p.dollarAmount || 0;
    const subject = `⚠️ Payment Issue - Please Update Card | CasaGrown`;
    const greeting = `Hi ${r.name || "there"},`;

    const warningGradient = "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)";

    const bodyHtml = `
<div style="margin: 0 0 16px; padding: 16px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 10px;">
  <p style="margin: 0; font-size: 14px; color: #991b1b; line-height: 1.6;">
    We were unable to charge <strong>$${amount.toFixed(2)}</strong> from your card.
    Please update your payment method to continue using the market.
  </p>
</div>
${infoCard([
    { label: "Amount Due", value: `$${amount.toFixed(2)}` },
    ...(p.cardLast4 ? [{ label: "Card", value: `•••• ${p.cardLast4}` }] : []),
])}
<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0 0 8px 0; font-weight: 600; color: #92400e;">What to do:</p>
  <ol style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.8;">
    <li>Go to your Profile and update your payment method</li>
    <li>The outstanding amount will be retried automatically</li>
    <li>You won't be able to place new orders until this is resolved</li>
  </ol>
</div>
${actionButton("Update Payment Method", `${SITE_URL}/profile`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Payment Issue",
            greeting,
            bodyHtml,
            headerGradient: warningGradient,
            headerTextColor: "#92400e",
            headerSubtitleColor: "#b45309",
            headerEmoji: "⚠️",
        }),
    };
}

// =============================================================================
// (z) Dispute Closed - Admin Notification
// =============================================================================

function renderDisputeClosed(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const amount = p.dollarAmount || 0;
    const isWon = p.disputeWon ?? false;
    const fee = p.disputeFeeUsd ?? 15;
    const emoji = isWon ? "✅" : "❌";
    const resultText = isWon ? "Won" : "Lost";
    const subject = `${emoji} Dispute Closed: ${resultText} - $${amount.toFixed(2)} | CasaGrown`;
    const greeting = `Hi ${r.name || "Admin"},`;

    const resultDetail = isWon
        ? `The dispute for <strong>$${amount.toFixed(2)}</strong> has been resolved in our favor. The funds have been reinstated to our account. Note: the <strong>$${fee.toFixed(2)}</strong> dispute fee is permanent and will not be returned.`
        : `The dispute for <strong>$${amount.toFixed(2)}</strong> was lost. The disputed amount plus the <strong>$${fee.toFixed(2)}</strong> dispute fee have been deducted from our account.`;

    const bodyHtml = `
<div style="margin: 0 0 16px; padding: 16px; background: ${isWon ? "#f0fdf4" : "#fef2f2"}; border: 1px solid ${isWon ? "#bbf7d0" : "#fca5a5"}; border-radius: 10px;">
  <p style="margin: 0; font-size: 14px; color: ${isWon ? "#166534" : "#991b1b"}; line-height: 1.6;">
    ${resultDetail}
  </p>
</div>
${infoCard([
    { label: "Result", value: `${emoji} ${resultText}` },
    { label: "Disputed Amount", value: `$${amount.toFixed(2)}` },
    { label: "Dispute Fee", value: `$${fee.toFixed(2)}` },
    { label: "Net Impact", value: isWon ? `-$${fee.toFixed(2)} (fee only)` : `-$${(amount + fee).toFixed(2)}` },
])}
${actionButton("View Disputes", `${SITE_URL}/disputes`)}`;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: `Dispute ${resultText}`,
            greeting,
            bodyHtml,
            headerGradient: isWon
                ? "linear-gradient(135deg, #15803d 0%, #16a34a 50%, #22c55e 100%)"
                : "linear-gradient(135deg, #991b1b 0%, #dc2626 50%, #ef4444 100%)",
            headerEmoji: emoji,
        }),
    };
}

// =============================================================================
// (s) Subscription Receipt
// =============================================================================

function renderSubscriptionReceipt(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const sub = p.subscriptionData || {
        planName: 'CasaGrown Pro',
        amount: 0,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        invoiceId: 'N/A',
    };

    const greeting = `Hi ${r.name || 'there'},`;
    const subject = `Payment Receipt — ${sub.planName} | CasaGrown`;

    const invoiceLinkRow = sub.invoiceUrl
        ? `<tr>
            <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Invoice</td>
            <td style="font-size: 12px; text-align: right; padding: 2px 0;"><a href="${sub.invoiceUrl}" style="color: #16a34a; text-decoration: none;">View on Stripe ↗</a></td>
           </tr>`
        : '';

    const periodRow = (sub.periodStart && sub.periodEnd)
        ? `<tr>
            <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Billing Period</td>
            <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${sub.periodStart} — ${sub.periodEnd}</td>
           </tr>`
        : '';

    const bodyHtml = `
        <p style="margin: 0 0 16px; font-size: 13px; color: #666; line-height: 1.5;">Your subscription payment has been processed successfully. Here's your receipt.</p>

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 10px; overflow: hidden; margin-bottom: 16px;">
          <tr>
            <td style="padding: 16px 20px;">
              <p style="margin: 0 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Subscription Receipt</p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Plan</td>
                  <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${sub.planName}</td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Amount</td>
                  <td style="font-size: 14px; font-weight: 600; color: #16a34a; text-align: right; padding: 2px 0;">$${sub.amount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Date</td>
                  <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${sub.date}</td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Status</td>
                  <td style="font-size: 12px; color: #16a34a; font-weight: 600; text-align: right; padding: 2px 0;">✅ Paid</td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Invoice ID</td>
                  <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${sub.invoiceId}</td>
                </tr>
                ${periodRow}
                ${invoiceLinkRow}
              </table>
            </td>
          </tr>
        </table>

        <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">Thank you for being a Pro seller! 🌱</p>
    `;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: 'Payment Receipt',
            greeting,
            bodyHtml,
            headerGradient: 'linear-gradient(135deg, #15803d 0%, #16a34a 50%, #22c55e 100%)',
            headerEmoji: '🧾',
        }),
    };
}

// =============================================================================
// Stripe Connect Payout Transfer Success
// =============================================================================

function renderStripeConnectTransferSuccess(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const greeting = `Hi ${r.name || "there"},`;
    const subject = `💸 Direct Deposit Completed — $${(p.dollarAmount || 0).toFixed(2)} | CasaGrown`;

    const bodyHtml = `
        <p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
            We are happy to let you know that your direct deposit has been successfully processed! Your net earnings from the recent market settlement have been transferred directly to your linked bank account via Stripe Connect.
        </p>
        ${infoCard([
            { label: "Amount Deposited", value: `$${(p.dollarAmount || 0).toFixed(2)}` },
            { label: "Payout Method", value: "Direct Deposit (Stripe Connect)" },
            ...(p.stripeTransferId ? [{ label: "Reference ID", value: p.stripeTransferId }] : []),
            {
                label: "Completed At",
                value: new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                }) + " UTC",
            },
        ])}
        <p style="margin: 16px 0 0; font-size: 12px; color: #6b7280; line-height: 1.5; font-style: italic;">
            *Standard transfers typically take 1 to 3 business days to reflect in your bank statement depending on your bank's processing times.
        </p>
        ${actionButton("View Earnings Dashboard", `${SITE_URL}/earnings`)}
    `;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Direct Deposit Successful",
            greeting,
            bodyHtml,
            headerGradient: "linear-gradient(135deg, #15803d 0%, #16a34a 50%, #22c55e 100%)",
            headerEmoji: "💸",
        }),
    };
}

// =============================================================================
// Stripe Connect Payout Transfer Failed / Reversed
// =============================================================================

function renderStripeConnectTransferFailed(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const greeting = `Hi ${r.name || "there"},`;
    const subject = `⚠️ Action Required: Direct Deposit Failed — $${(p.dollarAmount || 0).toFixed(2)} | CasaGrown`;

    const bodyHtml = `
        <p style="margin: 0 0 16px; font-size: 13px; color: #666666; line-height: 1.6;">
            We wanted to let you know that our recent attempt to deposit your market earnings of <strong>$${(p.dollarAmount || 0).toFixed(2)}</strong> to your bank account via Stripe Connect was unsuccessful.
        </p>
        <div style="margin: 0 0 16px; padding: 12px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-size: 13px; color: #b45309; line-height: 1.5;">
                <strong>Stripe/Bank Rejection Reason:</strong><br/>
                <em>"${p.errorMessage || "Unknown account or routing block"}"</em>
            </p>
        </div>
        <div style="margin: 0 0 16px; padding: 12px; background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 8px; border-left: 4px solid #16a34a;">
            <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.5;">
                <strong>🔒 But don't worry — your funds are safe!</strong><br/>
                We have automatically activated our payout safety net and refunded the full amount of <strong>$${(p.dollarAmount || 0).toFixed(2)}</strong> directly back into your CasaGrown virtual wallet.
            </p>
        </div>
        ${infoCard([
            { label: "Attempted Amount", value: `$${(p.dollarAmount || 0).toFixed(2)}` },
            { label: "Status", value: "Restored to Wallet (Wallet Fallback)" },
            { label: "Next Steps", value: "Update bank settings or withdraw manually" },
        ])}
        <p style="margin: 16px 0 0; font-size: 13px; color: #666666; line-height: 1.5;">
            To claim your funds immediately, simply click the button below to withdraw your restored balance using our manual channels, such as <strong>Venmo</strong>, <strong>PayPal</strong>, or a <strong>Digital Gift Card</strong>.
        </p>
        <p style="margin: 12px 0 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
            *If you still wish to receive direct deposits to your bank account for future settlements, please visit your payout settings dashboard and click "Fix in Stripe Onboarding" to resolve your Stripe Connect bank details.
        </p>
        ${actionButton("Withdraw Wallet Balance", `${SITE_URL}/earnings/payout`)}
    `;

    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title: "Direct Deposit Unsuccessful",
            greeting,
            bodyHtml,
            headerGradient: "linear-gradient(135deg, #b91c1c 0%, #dc2626 50%, #ef4444 100%)",
            headerEmoji: "⚠️",
        }),
    };
}

// =============================================================================
// (u) Subscription Change (Signup, Upgrade, Downgrade, Cancel)
// =============================================================================

function renderSubscriptionChange(
    p: NotificationPayload,
    r: EmailRecipient,
): { subject: string; htmlBody: string } {
    const plan = p.plan || 'lite';
    const action = p.action || 'signup'; // 'signup' | 'upgrade' | 'downgrade' | 'cancel'
    const planDisplayName = plan === 'elite' ? 'CasaGrown Elite' : plan === 'pro' ? 'CasaGrown Pro' : 'CasaGrown Lite Base';
    
    let subject = '';
    let title = '';
    let intro = '';
    
    if (action === 'signup') {
        subject = `🎉 Welcome to ${planDisplayName}! | CasaGrown`;
        title = `Welcome to ${planDisplayName}!`;
        intro = `Thank you for signing up for the <strong>${planDisplayName}</strong> tier! We are thrilled to have you as part of our seller community. Here is your handy package user's guide to help you get started.`;
    } else if (action === 'upgrade') {
        subject = `🚀 Plan Upgraded to ${planDisplayName}! | CasaGrown`;
        title = `Plan Upgraded to ${planDisplayName}!`;
        intro = `Congratulations! You have successfully upgraded to the <strong>${planDisplayName}</strong> tier. Your new features and higher stand limits are active immediately. Check out your new user's guide below!`;
    } else if (action === 'downgrade') {
        subject = `🚜 Plan Switched to ${planDisplayName} | CasaGrown`;
        title = `Plan Changed to ${planDisplayName}`;
        intro = `Your subscription has been switched to the <strong>${planDisplayName}</strong> tier. Your stand limits and feature access have been updated accordingly. Here is your user's guide for the new plan.`;
    } else if (action === 'cancel') {
        subject = `🏡 Subscription Cancellation Confirmed | CasaGrown`;
        title = `Subscription Cancellation Confirmed`;
        intro = `Your premium subscription cancellation has been processed. At the end of your current billing period, your plan will transition to the free <strong>CasaGrown Lite Base</strong> tier. We appreciate your support, and here is a guide on how your new Lite plan will work.`;
    }
    
    const guideHtml = getUserGuideHtml(plan, p.waNumber);
    const bodyHtml = `
        <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">${intro}</p>
        ${guideHtml}
        <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280; line-height: 1.5; text-align: center;">
          You can manage your subscription anytime from <a href="${SITE_URL}/pro-manage" style="color: #059669; font-weight: 600; text-decoration: none;">Pro Management</a>.
        </p>
    `;
    
    return {
        subject,
        htmlBody: wrapInBrandedTemplate({
            title,
            greeting: `Hi ${r.name || 'there'},`,
            bodyHtml,
            headerGradient: plan === 'elite' 
                ? 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)' 
                : plan === 'pro' 
                    ? 'linear-gradient(135deg, #15803d 0%, #16a34a 50%, #22c55e 100%)' 
                    : 'linear-gradient(135deg, #4b5563 0%, #6b7280 50%, #9ca3af 100%)',
            headerEmoji: plan === 'elite' ? '👑' : plan === 'pro' ? '🚀' : '🚜',
        })
    };
}

function getUserGuideHtml(plan: string, waNumber?: string | null): string {
    const isElite = plan === 'elite';
    const isPro = plan === 'pro';
    
    let guideContent = '';
    
    if (isElite) {
        const waClean = waNumber ? waNumber.replace('+', '').replace(/\s+/g, '') : null;
        
        guideContent = `
            <div style="margin-top: 24px; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; text-align: left;">
                <h4 style="margin: 0 0 12px; font-size: 16px; color: #1e293b; font-weight: 700;">👑 Your CasaGrown Elite User's Guide</h4>
                <p style="margin: 0 0 16px; font-size: 13px; color: #475569; line-height: 1.6;">
                    Welcome to the Elite tier! You now have our full multi-channel sync, native AI cinematic video generation (Google Veo 3.1), and GrowBot copilot across all major channels.
                </p>

                <!-- WhatsApp number display -->
                ${waNumber ? `
                <div style="margin-bottom: 20px; padding: 14px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                    <strong style="display: block; font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">🟢 Your Provisioned WhatsApp Business Line:</strong>
                    <span style="font-size: 18px; font-weight: 800; color: #14532d; display: block; margin-bottom: 6px;">${waNumber}</span>
                    <strong style="display: block; font-size: 11px; color: #166534; margin-bottom: 2px;">🔗 Direct link to add to your website / socials:</strong>
                    <a href="https://wa.me/${waClean}" style="font-size: 13px; color: #059669; font-weight: 600; text-decoration: underline; word-break: break-all;">https://wa.me/${waClean}</a>
                </div>
                ` : ''}

                <!-- Features Summary -->
                <h5 style="margin: 16px 0 8px; font-size: 14px; color: #0f172a; font-weight: 600;">⭐️ Summarized Package Features:</h5>
                <table cellpadding="6" cellspacing="0" style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155; margin-bottom: 20px;">
                    <tr style="border-bottom: 1px solid #e2e8f0; background-color: #f1f5f9;">
                        <th style="text-align: left; font-weight: 700; width: 40%;">Feature</th>
                        <th style="text-align: left; font-weight: 700; color: #1e3a8a;">Elite Tier (Yours)</th>
                        <th style="text-align: left; font-weight: 500; color: #64748b;">Pro Tier</th>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td><strong>Sales Transaction Fee:</strong></td>
                        <td style="color: #059669; font-weight: 700;">2% (Reduced)</td>
                        <td>5%</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td><strong>Active Booths Limit:</strong></td>
                        <td style="font-weight: 700;">Unlimited Stands</td>
                        <td>3 Stands</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td><strong>WhatsApp Auto-responder:</strong></td>
                        <td style="color: #059669;">✔️ Included (Toll-free line)</td>
                        <td>❌ Not included</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td><strong>Google Maps Sync & catalog:</strong></td>
                        <td style="color: #059669;">✔️ Included (Local search sync)</td>
                        <td>❌ Not included</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td><strong>Vertex AI Video Reels (Veo):</strong></td>
                        <td style="color: #059669;">✔️ Included (Slideshow reels)</td>
                        <td>❌ Not included</td>
                    </tr>
                </table>
                
                <h5 style="margin: 16px 0 8px; font-size: 14px; color: #0f172a; font-weight: 600;">📥 Messaging & DM Inbox Hub</h5>
                <p style="margin: 0 0 12px; font-size: 13px; color: #475569; line-height: 1.5;">
                    Manage buyer conversations in one unified inbox at <a href="${SITE_URL}/messages" style="color: #059669; font-weight: 600; text-decoration: none;">casagrown.com/messages</a>:
                </p>
                <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6;">
                    <li style="margin-bottom: 8px;"><strong>Unified Inbox:</strong> Customer questions from Facebook Messenger, Instagram DMs, WhatsApp, and CasaGrown DMs are unified on the same page. You can read, review, and reply manually.</li>
                    <li style="margin-bottom: 8px;"><strong>Autopilot Yielding:</strong> GrowBot automatically replies to buyers. The moment you type and send a manual response, the bot pauses and yields control so you can talk directly.</li>
                </ul>

                <h5 style="margin: 16px 0 8px; font-size: 14px; color: #0f172a; font-weight: 600;">📦 Order & Stand Management</h5>
                <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6;">
                    <li style="margin-bottom: 8px;"><strong>Fulfillment Center:</strong> Track and manage pending orders, pickup/delivery slots, customer details, and capture payout deposits at <a href="${SITE_URL}/orders" style="color: #059669; font-weight: 600; text-decoration: none;">casagrown.com/orders</a>.</li>
                    <li style="margin-bottom: 8px;"><strong>Google Maps local sync:</strong> Stand products automatically sync daily. Local rich Map posts feature a blue "ORDER" button pointing straight back to your stand.</li>
                </ul>

                <h5 style="margin: 16px 0 8px; font-size: 14px; color: #0f172a; font-weight: 600;">⚙️ Configure Pro Settings</h5>
                <p style="margin: 0 0 12px; font-size: 13px; color: #475569; line-height: 1.5;">
                    Visit <a href="${SITE_URL}/pro-manage" style="color: #059669; font-weight: 600; text-decoration: none;">casagrown.com/pro-manage</a> to toggle individual channel bots, customize instructions, and adjust response delay sliders.
                </p>
            </div>
        `;
    } else if (isPro) {
        guideContent = `
            <div style="margin-top: 24px; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; text-align: left;">
                <h4 style="margin: 0 0 12px; font-size: 16px; color: #1e293b; font-weight: 700;">🚀 Your CasaGrown Pro User's Guide</h4>
                <p style="margin: 0 0 16px; font-size: 13px; color: #475569; line-height: 1.6;">
                    Welcome to the Pro tier! You now have automatic daily Facebook posting, catalog sync, and automated GrowBot Messenger replies active.
                </p>

                <!-- Features Summary -->
                <h5 style="margin: 16px 0 8px; font-size: 14px; color: #0f172a; font-weight: 600;">⭐️ Summarized Package Features:</h5>
                <table cellpadding="6" cellspacing="0" style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155; margin-bottom: 20px;">
                    <tr style="border-bottom: 1px solid #e2e8f0; background-color: #f1f5f9;">
                        <th style="text-align: left; font-weight: 700; width: 40%;">Feature</th>
                        <th style="text-align: left; font-weight: 700; color: #15803d;">Pro Tier (Yours)</th>
                        <th style="text-align: left; font-weight: 500; color: #64748b;">Elite Tier</th>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td><strong>Sales Transaction Fee:</strong></td>
                        <td style="color: #059669; font-weight: 700;">5%</td>
                        <td>2% (Reduced)</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td><strong>Active Booths Limit:</strong></td>
                        <td style="font-weight: 700;">3 Stands</td>
                        <td>Unlimited Stands</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td><strong>GrowBot AI Auto-replies:</strong></td>
                        <td style="color: #059669;">✔️ Messenger & CasaGrown</td>
                        <td>✔️ All Channels + WhatsApp</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td><strong>Google Maps Sync & catalog:</strong></td>
                        <td>❌ Not included</td>
                        <td style="color: #059669;">✔️ Included</td>
                    </tr>
                </table>
                
                <h5 style="margin: 16px 0 8px; font-size: 14px; color: #0f172a; font-weight: 600;">📥 Messaging & DM Inbox Hub</h5>
                <p style="margin: 0 0 12px; font-size: 13px; color: #475569; line-height: 1.5;">
                    Manage your Facebook Messenger and CasaGrown DMs directly inside the unified inbox at <a href="${SITE_URL}/messages" style="color: #059669; font-weight: 600; text-decoration: none;">casagrown.com/messages</a>. 
                    GrowBot automatically answers buyer questions but yields control the moment you write a manual reply.
                </p>

                <h5 style="margin: 16px 0 8px; font-size: 14px; color: #0f172a; font-weight: 600;">📦 Orders & Posting</h5>
                <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6;">
                    <li style="margin-bottom: 8px;"><strong>Fulfillment Center:</strong> Track all buyer orders, confirm pickup timings, and resolve dispute issues at <a href="${SITE_URL}/orders" style="color: #059669; font-weight: 600; text-decoration: none;">casagrown.com/orders</a>.</li>
                    <li style="margin-bottom: 8px;"><strong>Daily Facebook Posts:</strong> Your stands' active menu items are automatically posted to your linked Facebook page daily.</li>
                </ul>

                <h5 style="margin: 16px 0 8px; font-size: 14px; color: #0f172a; font-weight: 600;">⚙️ Configure Pro Settings</h5>
                <p style="margin: 0 0 12px; font-size: 13px; color: #475569; line-height: 1.5;">
                    Visit <a href="${SITE_URL}/pro-manage" style="color: #059669; font-weight: 600; text-decoration: none;">casagrown.com/pro-manage</a> to write custom instructions for GrowBot, select active bot channels, adjust reply delay timers, and view Facebook link statuses.
                </p>
            </div>
        `;
    } else {
        guideContent = `
            <div style="margin-top: 24px; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; text-align: left;">
                <h4 style="margin: 0 0 12px; font-size: 16px; color: #1e293b; font-weight: 700;">🚜 Your CasaGrown Lite User's Guide</h4>
                <p style="margin: 0 0 16px; font-size: 13px; color: #475569; line-height: 1.6;">
                    You are now on the Lite tier. This free base tier supports simple Facebook catalog sync and manual messaging.
                </p>
                <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6;">
                    <li style="margin-bottom: 8px;"><strong>Facebook Manual Inbox:</strong> Find and respond to all customer DMs manually inside the official <a href="https://business.facebook.com" style="color: #059669; font-weight: 600; text-decoration: none;">Meta Business Suite Inbox</a>.</li>
                    <li style="margin-bottom: 8px;"><strong>Order Board:</strong> Keep track of buyer orders and confirm pickups at <a href="${SITE_URL}/orders" style="color: #059669; font-weight: 600; text-decoration: none;">casagrown.com/orders</a>.</li>
                </ul>
            </div>
        `;
    }

    // Common encouragement section for Stripe Connect and app downloads
    guideContent += `
        <div style="margin-top: 16px; padding: 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; text-align: left;">
            <h5 style="margin: 0 0 8px; font-size: 14px; color: #166534; font-weight: 700;">💸 Setup Stripe Connect for Instant Deposits</h5>
            <p style="margin: 0 0 12px; font-size: 13px; color: #14532d; line-height: 1.6;">
                We highly encourage you to connect your bank account or debit card using our Stripe Connect onboarding wizard. Once set up, all your sales earnings will be deposited <strong>directly into your bank account automatically</strong>—bypassing manual withdrawals!
            </p>
            <a href="${SITE_URL}/earnings" style="display: inline-block; padding: 10px 20px; background-color: #059669; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px;">
                Link Bank via Stripe Connect
            </a>
        </div>

        <div style="margin-top: 16px; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; text-align: left;">
            <h5 style="margin: 0 0 8px; font-size: 14px; color: #0f172a; font-weight: 700;">📲 Download the CasaGrown Seller App</h5>
            <p style="margin: 0 0 12px; font-size: 13px; color: #475569; line-height: 1.5;">
                Manage your stands, catalog items, DMs, and customer orders on the go by downloading our native mobile apps:
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top: 8px;">
                <tr>
                    <td style="padding-right: 12px;">
                        <a href="https://apps.apple.com/us/app/casagrown/id6400000000" style="display: inline-block; padding: 8px 16px; background-color: #0f172a; color: #ffffff; font-size: 12px; font-weight: 600; text-decoration: none; border-radius: 6px;">
                            🍏 App Store (iOS)
                        </a>
                    </td>
                    <td>
                        <a href="https://play.google.com/store/apps/details?id=com.casagrown.market" style="display: inline-block; padding: 8px 16px; background-color: #0f172a; color: #ffffff; font-size: 12px; font-weight: 600; text-decoration: none; border-radius: 6px;">
                            🤖 Google Play (Android)
                        </a>
                    </td>
                </tr>
            </table>
        </div>
    `;

    return guideContent;
}
