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

import { wrapInBrandedTemplate, infoCard, actionButton } from "./email-templates.ts";

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

      let infoRows = [
        { label: "Brand", value: data.brandName },
        { label: "Amount", value: fmtUsd(data.amount) }
      ];

      if (!isQueued && data.cardCode) {
        infoRows.push({ label: "Card Code", value: data.cardCode });
      }

      detailsHtml = infoCard(infoRows);

      if (!isQueued && data.cardUrl) {
        ctaHtml = actionButton("🎁 Use Your Gift Card", data.cardUrl);
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

      let infoRows = [
        { label: "Organization", value: data.organizationName },
        { label: "Project", value: data.projectTitle },
        { label: "Amount", value: fmtUsd(data.amount) }
      ];

      if (!isQueued && data.receiptNumber) {
        infoRows.push({ label: "Receipt #", value: data.receiptNumber });
      }

      detailsHtml = infoCard(infoRows);

      if (!isQueued && data.receiptUrl) {
        ctaHtml = actionButton("📄 View Donation Receipt", data.receiptUrl);
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

      let infoRows = [
        { label: "Method", value: provider },
        { label: "Destination", value: data.payoutTarget },
        { label: "Amount", value: fmtUsd(data.amount) },
        { label: "Fee", value: "$0.00 (free)" }
      ];

      if (!isQueued && data.transactionId) {
        infoRows.push({ label: "Transaction ID", value: data.transactionId });
      }

      detailsHtml = infoCard(infoRows);
      break;
    }
  }

  // Queued notice banner
  const queuedNotice = isQueued
    ? `
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
        <p style="margin: 0; font-size: 12px; color: #92400e; line-height: 1.5;">
          ⏳ <strong>Queued:</strong> Your transaction has been recorded and will be processed as soon as the provider becomes available. No action is needed — we'll email you when it's done.
        </p>
      </div>`
    : "";

  const headerBg = isQueued
    ? "linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)"
    : undefined; // Uses default green

  const htmlBody = wrapInBrandedTemplate({
    title: headerTitle,
    greeting,
    headerGradient: headerBg,
    bodyHtml: `
      <p style="margin: 0 0 20px; font-size: 13px; color: #666666; line-height: 1.5;">${summary}</p>
      ${detailsHtml}
      ${queuedNotice}
      ${ctaHtml}
    `,
    footer: "This is an automated receipt for your records. Please do not reply."
  });

  return { subject, htmlBody };
}
