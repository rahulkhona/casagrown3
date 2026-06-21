/**
 * send-transaction-email - Supabase Edge Function
 *
 * Sends branded transaction receipt emails for completed orders.
 * Called by DB triggers via net.http_post when an order is completed.
 *
 * Input:
 *   { recipients: [{ email, role, ... }], orderData: { ... } }
 *
 * Role can be: 'buyer', 'seller', 'delegator'
 * For delegated sales, 3 emails are sent (buyer + seller/delegate + delegator)
 * For normal sales, 2 emails are sent (buyer + seller)
 */

import {
  jsonError,
  jsonOk,
  serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { sendTransactionEmail } from "../_shared/postmark.ts";
import { wrapInBrandedTemplate } from "../_shared/email-templates.ts";

// Safety guard: never use localhost URLs in production emails
const _rawSiteUrl = Deno.env.get("SITE_URL") ?? "https://www.casagrown.com";
const SITE_URL = (
  _rawSiteUrl.includes("localhost") && Deno.env.get("POSTMARK_SERVER_TOKEN")
) ? "https://www.casagrown.com" : _rawSiteUrl;

interface Recipient {
  email: string;
  role: "buyer" | "seller" | "delegator";
}

interface OrderData {
  transactionId: string;
  date: string;
  product: string;
  quantity: number;
  unit: string;
  pointsPerUnit: number;
  subtotal: number;
  tax: number;
  total: number;
  sellerName: string;
  sellerZip: string;
  buyerName: string;
  buyerZip: string;
  harvestDate?: string;
  platformFee: number;
  feeRate: number;
  // Normal sale
  sellerPayout?: number;
  // Delegation sale
  delegated?: boolean;
  delegatePct?: number;
  delegateShare?: number;
  delegatorShare?: number;
  delegatorName?: string;
  delegateName?: string;
  // Credit applied (buyer purchase credit)
  creditApplied?: number;
  // Credit applied (seller platform_fee credit)
  sellerFeeCredit?: number;
  // Stripe fee pass-through (Pro sellers)
  stripeFee?: number;
  sellerPlan?: string;
  // Compliance
  receiptFooter?: string;
}

serveWithCors(async (req, { corsHeaders, env }) => {
  // Accept service_role calls from DB triggers
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const isServiceRole = token === env("SUPABASE_SERVICE_ROLE_KEY");

  if (!isServiceRole) {
    return jsonError(
      "Unauthorized - service_role required",
      corsHeaders,
      401,
    );
  }

  const { recipients, orderData } = await req.json() as {
    recipients: Recipient[];
    orderData: OrderData;
  };

  if (!recipients?.length || !orderData) {
    return jsonError(
      "Missing recipients or orderData",
      corsHeaders,
      400,
    );
  }

  const results: { email: string; success: boolean; error?: string }[] = [];

  for (const recipient of recipients) {
    const { subject, htmlBody } = renderReceipt(
      recipient,
      orderData,
    );

    const result = await sendTransactionEmail({
      to: recipient.email,
      subject,
      htmlBody,
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
    `📧 Transaction emails: sent=${sent}, failed=${failed} for order ${orderData.transactionId}`,
  );

  return jsonOk({ sent, failed, results }, corsHeaders);
});

// =============================================================================
// Template Rendering
// =============================================================================

function renderReceipt(
  recipient: Recipient,
  data: OrderData,
): { subject: string; htmlBody: string } {
  let subject: string;
  let greeting: string;
  let summary: string;
  let financialSection = "";

  const formattedDate = new Date(data.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const txIdShort = data.transactionId.substring(0, 8) + "..." +
    data.transactionId.slice(-3);

  switch (recipient.role) {
    case "buyer":
      subject = `Order Complete - ${data.product} | CasaGrown Receipt`;
      greeting = `Hi ${data.buyerName},`;
      summary =
        `Your order for ${data.quantity} ${data.unit} of ${data.product} has been completed. Here's your receipt.`;
      break;

    case "seller":
      if (data.delegated) {
        subject =
          `Sale Complete - ${data.product} (Delegated) | CasaGrown Receipt`;
        greeting = `Hi ${data.sellerName},`;
        summary =
          `Great news! Your delegated sale of ${data.quantity} ${data.unit} of ${data.product} has been completed.`;
        financialSection = buildFinancialSection({
          platformFee: data.platformFee,
          feeRate: data.feeRate,
          afterFee: data.subtotal - data.platformFee,
          delegated: true,
          delegatePct: data.delegatePct!,
          yourShare: data.delegateShare!,
          otherShare: data.delegatorShare!,
          otherName: data.delegatorName || "Delegator",
          sellerFeeCredit: data.sellerFeeCredit,
        });
      } else {
        subject = `Sale Complete - ${data.product} | CasaGrown Receipt`;
        greeting = `Hi ${data.sellerName},`;
        summary =
          `Great news! Your sale of ${data.quantity} ${data.unit} of ${data.product} has been completed.`;
        financialSection = buildFinancialSection({
          platformFee: data.platformFee,
          feeRate: data.feeRate,
          afterFee: data.sellerPayout!,
          delegated: false,
          sellerFeeCredit: data.sellerFeeCredit,
          stripeFee: data.stripeFee,
          sellerPlan: data.sellerPlan,
        });
      }
      break;

    case "delegator":
      subject = `Delegation Sale - ${data.product} | CasaGrown Receipt`;
      greeting = `Hi ${data.delegatorName || "there"},`;
      summary = `Your delegate ${
        data.delegateName || data.sellerName
      } sold ${data.quantity} ${data.unit} of ${data.product} on your behalf. Here's the breakdown.`;
      financialSection = buildFinancialSection({
        platformFee: data.platformFee,
        feeRate: data.feeRate,
        afterFee: data.subtotal - data.platformFee,
        delegated: true,
        delegatePct: data.delegatePct!,
        yourShare: data.delegatorShare!,
        otherShare: data.delegateShare!,
        otherName: data.delegateName || data.sellerName || "Delegate",
        sellerFeeCredit: data.sellerFeeCredit,
      });
      break;
  }

  const harvestDateRow = data.harvestDate
    ? `<tr>
            <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Harvest Date</td>
            <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${data.harvestDate}</td>
           </tr>`
    : "";

  const creditAppliedRow = (recipient.role === "buyer" && data.creditApplied && data.creditApplied > 0)
    ? `<tr>
        <td style="font-size: 12px; color: #059669; font-weight: 600; padding: 2px 0;">Credit Applied</td>
        <td style="font-size: 12px; color: #059669; font-weight: 600; text-align: right; padding: 2px 0;">-$${data.creditApplied.toFixed(2)}</td>
       </tr>`
    : "";

  const txBodyHtml = `
              <!-- Receipt Details -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 10px; overflow: hidden; margin-top: 16px; margin-bottom: 0;">

                <!-- Transaction Info -->
                <tr>
                  <td style="padding: 16px 20px 8px;">
                    <p style="margin: 0 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Transaction Info</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">ID</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">{{transactionId}}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Date</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">{{date}}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Type</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">Affiliated Network Fulfillment</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Divider -->
                <tr><td style="padding: 0 20px;"><div style="height: 1px; background: #dcfce7;"></div></td></tr>

                <!-- Parties -->
                <tr>
                  <td style="padding: 8px 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Seller</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">{{sellerName}}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Seller Zip</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">{{sellerZip}}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Buyer</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">{{buyerName}}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Buyer Zip</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">{{buyerZip}}</td>
                      </tr>
                      {{harvestDateRow}}
                    </table>
                  </td>
                </tr>

                <!-- Divider -->
                <tr><td style="padding: 0 20px;"><div style="height: 1px; background: #dcfce7;"></div></td></tr>

                <!-- Order Details -->
                <tr>
                  <td style="padding: 8px 20px;">
                    <p style="margin: 0 0 6px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Order Details</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 12px; color: #1f2937; padding: 2px 0;">{{product}} &mdash; {{quantity}} {{unit}} @ {{priceDisplay}}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Subtotal</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">{{subtotalDisplay}}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Sales Tax</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">{{taxDisplay}}</td>
                      </tr>
                      {{creditAppliedRow}}
                      <tr>
                        <td style="font-size: 12px; font-weight: 600; color: #1f2937; padding: 4px 0 2px;">Total</td>
                        <td style="font-size: 12px; font-weight: 600; color: #1f2937; text-align: right; padding: 4px 0 2px;">{{totalDisplay}}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Seller/Delegator financial details (conditionally shown) -->
                {{financialSection}}

              </table>`;

  const parsedTxBody = txBodyHtml
    .replace("{{transactionId}}", txIdShort)
    .replace("{{date}}", formattedDate)
    .replace("{{sellerName}}", data.sellerName || "N/A")
    .replace("{{sellerZip}}", data.sellerZip || "N/A")
    .replace("{{buyerName}}", data.buyerName || "N/A")
    .replace("{{buyerZip}}", data.buyerZip || "N/A")
    .replace("{{harvestDateRow}}", harvestDateRow)
    .replace("{{product}}", data.product || "Item")
    .replace("{{quantity}}", String(data.quantity || 0))
    .replace("{{unit}}", data.unit || "")
    .replace("{{priceDisplay}}", "$" + (data.pointsPerUnit || 0).toFixed(2))
    .replace("{{subtotalDisplay}}", "$" + (data.subtotal || 0).toFixed(2))
    .replace("{{taxDisplay}}", "$" + (data.tax || 0).toFixed(2))
    .replace("{{creditAppliedRow}}", creditAppliedRow)
    .replace("{{totalDisplay}}", "$" + (data.total || 0).toFixed(2))
    .replace("{{financialSection}}", financialSection);

  const html = wrapInBrandedTemplate({
      title: "Transaction Receipt",
      greeting,
      bodyHtml: `<p style="margin: 0 0 20px; font-size: 13px; color: #666666; line-height: 1.5;" class="email-subtext">${summary}</p>${parsedTxBody}`,
      footer: data.receiptFooter || "This receipt is for your records."
  });

  return { subject, htmlBody: html };
}

function buildFinancialSection(opts: {
  platformFee: number;
  feeRate: number;
  afterFee: number;
  delegated: boolean;
  delegatePct?: number;
  yourShare?: number;
  otherShare?: number;
  otherName?: string;
  sellerFeeCredit?: number;
  stripeFee?: number;
  sellerPlan?: string;
}): string {
  let rows = `
        <tr><td style="padding: 0 20px;"><div style="height: 1px; background: #dcfce7;"></div></td></tr>
        <tr>
          <td style="padding: 8px 20px 12px;">
            <p style="margin: 0 0 6px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Financial Summary</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="font-size: 12px; color: #d97706; padding: 2px 0;">Platform Fee (${
    Math.round(opts.feeRate * 100)
  }%)</td>
                <td style="font-size: 12px; color: #d97706; text-align: right; padding: 2px 0;">-$${opts.platformFee.toFixed(2)}</td>
              </tr>`;

  if (opts.sellerFeeCredit && opts.sellerFeeCredit > 0) {
    rows += `
              <tr>
                <td style="font-size: 12px; color: #059669; font-weight: 600; padding: 2px 0;">Fee Credit Applied</td>
                <td style="font-size: 12px; color: #059669; font-weight: 600; text-align: right; padding: 2px 0;">-$${opts.sellerFeeCredit.toFixed(2)}</td>
              </tr>`;
  }

  // Stripe processing fee pass-through (Pro sellers)
  if (opts.stripeFee && opts.stripeFee > 0) {
    rows += `
              <tr>
                <td style="font-size: 12px; color: #d97706; padding: 2px 0;">Stripe Processing Fee</td>
                <td style="font-size: 12px; color: #d97706; text-align: right; padding: 2px 0;">-$${opts.stripeFee.toFixed(2)}</td>
              </tr>`;
  }

  if (opts.delegated) {
    rows += `
              <tr>
                <td colspan="2" style="padding: 6px 0 2px;">
                  <span style="font-size: 11px; font-weight: 600; color: #6b7280;">Delegation Split (${opts.delegatePct}% delegate / ${
      100 - (opts.delegatePct || 50)
    }% delegator)</span>
                </td>
              </tr>
              <tr>
                <td style="font-size: 12px; color: #16a34a; font-weight: 600; padding: 2px 0;">Your Share</td>
                <td style="font-size: 12px; color: #16a34a; font-weight: 600; text-align: right; padding: 2px 0;">$${(opts.yourShare ?? 0).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">${opts.otherName}'s Share</td>
                <td style="font-size: 12px; color: #6b7280; text-align: right; padding: 2px 0;">$${(opts.otherShare ?? 0).toFixed(2)}</td>
              </tr>`;
  } else {
    rows += `
              <tr>
                <td style="font-size: 12px; color: #16a34a; font-weight: 600; padding: 4px 0 2px;">You Received</td>
                <td style="font-size: 12px; color: #16a34a; font-weight: 600; text-align: right; padding: 4px 0 2px;">$${opts.afterFee.toFixed(2)}</td>
              </tr>`;
  }

  rows += `
            </table>
          </td>
        </tr>`;

  return rows;
}
