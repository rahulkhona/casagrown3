/**
 * Shared payout email templates for gift card, donation, and cashout.
 *
 * Renders branded HTML emails that match the existing transaction receipt style.
 * Supports both "completed" and "queued" states.
 *
 * Usage:
 *   import { buildPayoutEmail } from "../_shared/payout-email.ts";
 *   const { subject, htmlBody } = buildPayoutEmail({ type: "gift_card", ... });
 */

const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:3000";

// ── Types ──

interface GiftCardEmailData {
  type: "gift_card";
  status: "completed" | "queued";
  userName: string;
  brandName: string;
  amount: number; // USD
  cardCode?: string;
  cardUrl?: string;
  provider?: string;
  redemptionId?: string;
}

interface DonationEmailData {
  type: "donation";
  status: "completed" | "queued";
  userName: string;
  organizationName: string;
  projectTitle: string;
  amount: number; // USD
  receiptNumber?: string;
  receiptUrl?: string;
  redemptionId?: string;
}

interface CashoutEmailData {
  type: "cashout";
  status: "completed" | "queued";
  userName: string;
  amount: number; // USD
  payoutTarget: string; // email or phone
  handleType: string; // "venmo" or "paypal"
  transactionId?: string;
  redemptionId?: string;
}

export type PayoutEmailData =
  | GiftCardEmailData
  | DonationEmailData
  | CashoutEmailData;

// ── Builder ──

export function buildPayoutEmail(
  data: PayoutEmailData,
): { subject: string; htmlBody: string } {
  const isQueued = data.status === "queued";
  const date = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  let subject: string;
  let greeting: string;
  let summary: string;
  let detailsHtml: string;
  let statusColor: string;
  let statusIcon: string;
  let statusText: string;
  let headerTitle: string;
  let ctaHtml = "";

  if (isQueued) {
    statusColor = "#d97706"; // amber
    statusIcon = "⏳";
    statusText = "Queued for Processing";
  } else {
    statusColor = "#16a34a"; // green
    statusIcon = "✅";
    statusText = "Completed";
  }

  const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

  switch (data.type) {
    case "gift_card": {
      headerTitle = isQueued ? "Gift Card Queued" : "Gift Card Ready!";
      subject = isQueued
        ? `Gift Card Queued — ${data.brandName} | CasaGrown`
        : `Your ${data.brandName} Gift Card is Ready! 🎁 | CasaGrown`;
      greeting = `Hi ${data.userName},`;
      summary = isQueued
        ? `Your ${data.brandName} gift card (${fmtUsd(data.amount)}) has been queued due to provider delays. We'll send you another email as soon as it's ready.`
        : `Your ${data.brandName} gift card (${fmtUsd(data.amount)}) is ready to use!`;

      detailsHtml = `
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Brand</td>
          <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${data.brandName}</td>
        </tr>
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Amount</td>
          <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${fmtUsd(data.amount)}</td>
        </tr>`;

      if (!isQueued && data.cardCode) {
        detailsHtml += `
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Card Code</td>
          <td style="font-size: 12px; color: #1f2937; font-weight: 600; text-align: right; padding: 2px 0;">${data.cardCode}</td>
        </tr>`;
      }

      if (!isQueued && data.cardUrl) {
        ctaHtml = `
          <tr>
            <td style="padding: 20px 32px;">
              <a href="${data.cardUrl}" style="display: block; background: linear-gradient(135deg, #15803d, #22c55e); color: #ffffff; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 10px; font-size: 15px; font-weight: 600;">
                🎁 Use Your Gift Card
              </a>
            </td>
          </tr>`;
      }
      break;
    }

    case "donation": {
      headerTitle = isQueued ? "Donation Queued" : "Thank You for Donating!";
      subject = isQueued
        ? `Donation Queued — ${data.organizationName} | CasaGrown`
        : `Donation Confirmed — ${fmtUsd(data.amount)} to ${data.organizationName} 💚 | CasaGrown`;
      greeting = `Hi ${data.userName},`;
      summary = isQueued
        ? `Your donation of ${fmtUsd(data.amount)} to ${data.organizationName} has been queued and will be processed shortly.`
        : `Your donation of ${fmtUsd(data.amount)} to ${data.organizationName} has been processed. Thank you for making a difference!`;

      detailsHtml = `
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Organization</td>
          <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${data.organizationName}</td>
        </tr>
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Project</td>
          <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${data.projectTitle}</td>
        </tr>
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Amount</td>
          <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${fmtUsd(data.amount)}</td>
        </tr>`;

      if (!isQueued && data.receiptNumber) {
        detailsHtml += `
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Receipt #</td>
          <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${data.receiptNumber}</td>
        </tr>`;
      }

      if (!isQueued && data.receiptUrl) {
        ctaHtml = `
          <tr>
            <td style="padding: 20px 32px;">
              <a href="${data.receiptUrl}" style="display: block; background: linear-gradient(135deg, #15803d, #22c55e); color: #ffffff; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 10px; font-size: 15px; font-weight: 600;">
                📄 View Donation Receipt
              </a>
            </td>
          </tr>`;
      }
      break;
    }

    case "cashout": {
      const provider =
        data.handleType === "venmo" ? "Venmo" : "PayPal";
      headerTitle = isQueued ? "Payout Queued" : "Payout Sent!";
      subject = isQueued
        ? `Payout Queued — ${fmtUsd(data.amount)} | CasaGrown`
        : `Payout Sent — ${fmtUsd(data.amount)} to ${provider} 💸 | CasaGrown`;
      greeting = `Hi ${data.userName},`;
      summary = isQueued
        ? `Your payout of ${fmtUsd(data.amount)} to ${data.payoutTarget} has been queued due to provider delays. You'll receive another email when it's processed.`
        : `Your payout of ${fmtUsd(data.amount)} has been sent to your ${provider} account (${data.payoutTarget}). Standard transfers take 1-3 business days.`;

      detailsHtml = `
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Method</td>
          <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${provider}</td>
        </tr>
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Destination</td>
          <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${data.payoutTarget}</td>
        </tr>
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Amount</td>
          <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${fmtUsd(data.amount)}</td>
        </tr>
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Fee</td>
          <td style="font-size: 12px; color: #16a34a; text-align: right; padding: 2px 0;">$0.00 (free)</td>
        </tr>`;

      if (!isQueued && data.transactionId) {
        detailsHtml += `
        <tr>
          <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Transaction ID</td>
          <td style="font-size: 12px; color: #1f2937; font-weight: 600; text-align: right; padding: 2px 0;">${data.transactionId}</td>
        </tr>`;
      }
      break;
    }
  }

  // Queued notice banner
  const queuedNotice = isQueued
    ? `
      <tr>
        <td style="padding: 12px 32px 0;">
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px;">
            <p style="margin: 0; font-size: 12px; color: #92400e; line-height: 1.5;">
              ⏳ <strong>Queued:</strong> Your transaction has been recorded and will be processed as soon as the provider becomes available. No action is needed — we'll email you when it's done.
            </p>
          </div>
        </td>
      </tr>`
    : "";

  const headerBg = isQueued
    ? "linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)"
    : "linear-gradient(135deg, #15803d 0%, #16a34a 50%, #22c55e 100%)";

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headerTitle} — CasaGrown</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    body { margin: 0; padding: 0; width: 100% !important; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7fa;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="background: ${headerBg}; padding: 24px 32px 20px; text-align: center;">
              <div style="margin-bottom: 8px;">
                <img src="${SITE_URL}/logo.png" alt="CasaGrown" width="48" height="48" style="display: inline-block; width: 48px; height: 48px; object-fit: contain;" />
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                ${headerTitle}
              </h1>
              <p style="margin: 8px 0 0; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.9); letter-spacing: 3px; text-transform: uppercase;">
                FRESH &bull; LOCAL &bull; TRUSTED
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px 0;">
              <p style="margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #1a1a2e;">${greeting}</p>
              <p style="margin: 0 0 20px; font-size: 13px; color: #666666; line-height: 1.5;">${summary}</p>
            </td>
          </tr>

          <!-- Details -->
          <tr>
            <td style="padding: 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: ${isQueued ? "#fffbeb" : "#f0fdf4"}; border: 1px solid ${isQueued ? "#fde68a" : "#dcfce7"}; border-radius: 10px; overflow: hidden;">
                <tr>
                  <td style="padding: 16px 20px 8px;">
                    <p style="margin: 0 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Payout Details</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Date</td>
                        <td style="font-size: 12px; color: #1f2937; text-align: right; padding: 2px 0;">${date}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #6b7280; padding: 2px 0;">Status</td>
                        <td style="font-size: 12px; color: ${statusColor}; font-weight: 600; text-align: right; padding: 2px 0;">${statusIcon} ${statusText}</td>
                      </tr>
                      ${detailsHtml}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${queuedNotice}
          ${ctaHtml}

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
                This is an automated receipt for your records. Please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`.replace(/[ \t]+$/gm, "");

  return { subject, htmlBody };
}
