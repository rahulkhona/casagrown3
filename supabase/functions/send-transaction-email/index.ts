/**
 * send-transaction-email — Supabase Edge Function
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

// Site URL for logo
const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:3000";

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
  // Compliance
  receiptFooter?: string;
}

serveWithCors(async (req, { corsHeaders, env }) => {
  // Accept service_role calls from DB triggers
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const isServiceRole = token === env("SUPABASE_SERVICE_ROLE_KEY");

  if (!isServiceRole) {
    return jsonError(
      "Unauthorized — service_role required",
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
      subject = `Order Complete — ${data.product} | CasaGrown Receipt`;
      greeting = `Hi ${data.buyerName},`;
      summary =
        `Your order for ${data.quantity} ${data.unit} of ${data.product} has been completed. Here's your receipt.`;
      break;

    case "seller":
      if (data.delegated) {
        subject =
          `Sale Complete — ${data.product} (Delegated) | CasaGrown Receipt`;
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
        });
      } else {
        subject = `Sale Complete — ${data.product} | CasaGrown Receipt`;
        greeting = `Hi ${data.sellerName},`;
        summary =
          `Great news! Your sale of ${data.quantity} ${data.unit} of ${data.product} has been completed.`;
        financialSection = buildFinancialSection({
          platformFee: data.platformFee,
          feeRate: data.feeRate,
          afterFee: data.sellerPayout!,
          delegated: false,
        });
      }
      break;

    case "delegator":
      subject = `Delegation Sale — ${data.product} | CasaGrown Receipt`;
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
      });
      break;
  }

  const harvestDateRow = data.harvestDate
    ? `<tr>
            <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Harvest Date</td>
            <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${data.harvestDate}</td>
           </tr>`
    : "";

  // Inline template — file reads don't work in Docker edge runtime
  // (functions compile to /var/tmp/sb-compile-edge-runtime/ where templates/ doesn't exist)
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CasaGrown Transaction Receipt</title>
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
                <img src="{{siteUrl}}/logo.png" alt="CasaGrown" width="48" height="48" style="display: inline-block; width: 48px; height: 48px; object-fit: contain;" />
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                Transaction Receipt
              </h1>
              <p style="margin: 8px 0 0; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.9); letter-spacing: 3px; text-transform: uppercase;">
                FRESH &bull; LOCAL &bull; TRUSTED
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px 0;">
              <!-- Role-specific greeting -->
              <p style="margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #1a1a2e;" class="email-text">
                {{greeting}}
              </p>
              <p style="margin: 0 0 20px; font-size: 13px; color: #666666; line-height: 1.5;" class="email-subtext">
                {{summary}}
              </p>
            </td>
          </tr>

          <!-- Receipt Details -->
          <tr>
            <td style="padding: 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 10px; overflow: hidden;">

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
                        <td style="font-size: 12px; color: #1f2937; padding: 2px 0;">{{product}} &mdash; {{quantity}} {{unit}} @ {{pointsPerUnit}} pts</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Subtotal</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">{{subtotal}} pts</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Sales Tax</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">{{tax}} pts</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; font-weight: 600; color: #1f2937; padding: 4px 0 2px;">Total</td>
                        <td style="font-size: 12px; font-weight: 600; color: #1f2937; text-align: right; padding: 4px 0 2px;">{{total}} pts</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Seller/Delegator financial details (conditionally shown) -->
                {{financialSection}}

              </table>
            </td>
          </tr>

          <!-- Receipt Footer (compliance) -->
          <tr>
            <td style="padding: 16px 32px 0;">
              <p style="margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5; font-style: italic;">
                {{receiptFooter}}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 16px 32px 0;">
              <div style="height: 1px; background-color: #eee;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px 24px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #999999; line-height: 1.6;">
                Fresh from Neighbors' backyard 🌱<br />
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

  html = html
    .replace(/\{\{siteUrl\}\}/g, SITE_URL)
    .replace("{{greeting}}", greeting)
    .replace("{{summary}}", summary)
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
    .replace("{{pointsPerUnit}}", String(data.pointsPerUnit || 0))
    .replace("{{subtotal}}", String(data.subtotal || 0))
    .replace("{{tax}}", String(data.tax || 0))
    .replace("{{total}}", String(data.total || 0))
    .replace("{{financialSection}}", financialSection)
    .replace("{{receiptFooter}}", data.receiptFooter || "");

  // Strip trailing whitespace on each line to prevent MIME =20 artifacts
  html = html.replace(/[ \t]+$/gm, "");

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
                <td style="font-size: 12px; color: #d97706; text-align: right; padding: 2px 0;">-${opts.platformFee} pts</td>
              </tr>`;

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
                <td style="font-size: 12px; color: #16a34a; font-weight: 600; text-align: right; padding: 2px 0;">${opts.yourShare} pts</td>
              </tr>
              <tr>
                <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">${opts.otherName}'s Share</td>
                <td style="font-size: 12px; color: #6b7280; text-align: right; padding: 2px 0;">${opts.otherShare} pts</td>
              </tr>`;
  } else {
    rows += `
              <tr>
                <td style="font-size: 12px; color: #16a34a; font-weight: 600; padding: 4px 0 2px;">You Received</td>
                <td style="font-size: 12px; color: #16a34a; font-weight: 600; text-align: right; padding: 4px 0 2px;">${opts.afterFee} pts</td>
              </tr>`;
  }

  rows += `
            </table>
          </td>
        </tr>`;

  return rows;
}
