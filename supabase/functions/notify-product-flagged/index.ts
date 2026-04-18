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
import { wrapInBrandedTemplate, actionButton } from "../_shared/email-templates.ts";

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


        const warningGradient = "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)";
        const darkTextColor = "#92400e";
        const darkSubtitleColor = "#b45309";

        const htmlBody = wrapInBrandedTemplate({
            title: "Product Flagged",
            greeting: `Hi ${seller_name || "there"},`,
            headerGradient: warningGradient,
            headerTextColor: darkTextColor,
            headerSubtitleColor: darkSubtitleColor,
            bodyHtml: `
              <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
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

              ${actionButton("✏️ Edit Listing", editUrl)}

              <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin-top: 24px;">
                If you believe this was flagged in error, editing and saving will trigger a fresh review and make your listing visible again.
              </p>
            `,
            footer: "CasaGrown Market &middot; Fresh. Local. Trusted."
        });

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
