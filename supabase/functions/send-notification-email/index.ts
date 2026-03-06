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
    | "delegation_accepted";

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
// Branded Template Wrapper
// =============================================================================

function wrapInBrandedTemplate(opts: {
    title: string;
    greeting: string;
    bodyHtml: string;
    footer?: string;
}): string {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${opts.title}</title>
<style>
body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
@media (prefers-color-scheme: dark) {
  .email-bg { background-color: #1a1a2e !important; }
  .email-card { background-color: #16213e !important; }
  .email-text { color: #e0e0e0 !important; }
  .email-subtext { color: #b0b0b0 !important; }
}
</style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7fa;" class="email-bg">
<tr>
<td align="center" style="padding: 40px 16px;">

<!-- Card -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;" class="email-card">

<!-- Header -->
<tr>
<td style="background: linear-gradient(135deg, #15803d 0%, #16a34a 50%, #22c55e 100%); padding: 24px 32px 20px; text-align: center;">
<div style="margin-bottom: 8px;">
<img src="${SITE_URL}/logo.png" alt="CasaGrown" width="48" height="48" style="display: inline-block; width: 48px; height: 48px; object-fit: contain;" />
</div>
<h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
${opts.title}
</h1>
<p style="margin: 8px 0 0; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.9); letter-spacing: 3px; text-transform: uppercase;">
FRESH &bull; LOCAL &bull; TRUSTED
</p>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding: 28px 32px 0;">
<p style="margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #1a1a2e;" class="email-text">
${opts.greeting}
</p>
</td>
</tr>

<tr>
<td style="padding: 8px 32px 20px;">
${opts.bodyHtml}
</td>
</tr>

${
        opts.footer
            ? `
<tr>
<td style="padding: 0 32px 16px;">
<p style="margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5; font-style: italic;">
${opts.footer}
</p>
</td>
</tr>
`
            : ""
    }

<!-- Divider -->
<tr>
<td style="padding: 0 32px;">
<div style="height: 1px; background-color: #eee;"></div>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding: 16px 32px 24px; text-align: center;">
<p style="margin: 0; font-size: 11px; color: #999999; line-height: 1.6;">
Fresh from Neighbors&rsquo; backyard 🌱<br />
This is an automated message. Please do not reply.
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>`;

    // Strip trailing whitespace to prevent MIME =20 artifacts
    html = html.replace(/[ \t]+$/gm, "");
    return html;
}

// =============================================================================
// Helper: Info Card
// =============================================================================

function infoCard(rows: Array<{ label: string; value: string }>): string {
    const rowsHtml = rows
        .map(
            (r) =>
                `<tr>
<td style="font-size: 13px; color: #6b7280; padding: 4px 0;">${r.label}</td>
<td style="font-size: 13px; color: #1f2937; text-align: right; padding: 4px 0; font-weight: 500;">${r.value}</td>
</tr>`,
        )
        .join("");

    return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 10px; overflow: hidden;">
<tr><td style="padding: 16px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${rowsHtml}
</table>
</td></tr>
</table>`;
}

// =============================================================================
// Helper: Action Button
// =============================================================================

function actionButton(label: string, url: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 20px;">
<tr><td align="center">
<a href="${url}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #15803d, #22c55e); color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
${label}
</a>
</td></tr>
</table>`;
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
