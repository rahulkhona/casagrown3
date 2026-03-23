/**
 * notify-product-flagged
 *
 * Sends an email to the seller when their product is flagged and hidden.
 * Called by the check_product_flag_threshold() trigger via pg_net.
 *
 * Payload:
 *   seller_id, seller_email, seller_name, product_name, product_id, flag_count
 */

import { sendTransactionEmail } from "../_shared/postmark.ts";

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
            },
        });
    }

    try {
        const {
            seller_email,
            seller_name,
            product_name,
            product_id,
            ai_flagged = false,
            ai_reason = "",
        } = await req.json();

        if (!seller_email || !product_name) {
            return new Response(
                JSON.stringify({ error: "Missing seller_email or product_name" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        const marketUrl = Deno.env.get("MARKET_APP_URL") ?? "http://localhost:3001";
        const editUrl = `${marketUrl}/my-booth/products/${product_id}`;

        const flagSource = ai_flagged
            ? "our automated content review"
            : "multiple community members";
        const reasonBlock = ai_flagged && ai_reason
            ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin:16px 0;color:#991b1b;font-size:14px;"><strong>Reason:</strong> ${ai_reason}</div>`
            : "";
        const subject = ai_flagged
            ? `⚠️ Your listing "${product_name}" needs edits`
            : `⚠️ Your product "${product_name}" has been flagged`;


        const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; padding: 0; margin: 0;">
  <div style="max-width: 520px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 32px 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 8px;">⚠️</div>
      <h1 style="margin: 0; font-size: 22px; color: #92400e;">Product Flagged</h1>
    </div>

    <!-- Body -->
    <div style="padding: 24px;">
      <p style="color: #374151; font-size: 15px; line-height: 1.6;">
        Hi ${seller_name || "there"},
      </p>
      <p style="color: #374151; font-size: 15px; line-height: 1.6;">
        Your listing <strong>"${product_name}"</strong> was flagged by ${flagSource} and has been <strong>temporarily hidden</strong> from the market.
      </p>

      ${reasonBlock}

      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: #92400e;">What to do:</p>
        <ol style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.8;">
          <li>Review your listing for any guideline issues</li>
          <li>Edit the name, photos, or description to address the concern</li>
          <li>Save — your listing will be automatically re-reviewed and republished</li>
        </ol>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${editUrl}" style="display: inline-block; background: #f59e0b; color: #fff; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px;">
          ✏️ Edit Listing
        </a>
      </div>

      <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">
        If you believe this was flagged in error, editing and saving will trigger a fresh review and make your listing visible again.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 16px 24px; background: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        CasaGrown Market · Fresh. Local. Trusted.
      </p>
    </div>
  </div>
</body>
</html>`;

        await sendTransactionEmail({
            to: seller_email,
            subject,
            htmlBody,
        });

        console.log(
            `📧 Flagged product email sent to ${seller_email} for "${product_name}"`,
        );

        return new Response(
            JSON.stringify({ ok: true }),
            { headers: { "Content-Type": "application/json" } },
        );
    } catch (err) {
        console.error("❌ notify-product-flagged error:", err);
        return new Response(
            JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }
});
