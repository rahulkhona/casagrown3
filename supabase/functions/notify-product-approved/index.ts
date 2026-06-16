/**
 * notify-product-approved
 *
 * Sends a congratulations email to the seller when their product is approved and live.
 *
 * Payload:
 *   seller_email, seller_name, product_name, product_id
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
        } = await req.json();

        if (!seller_email || !product_name || !product_id) {
            return new Response(
                JSON.stringify({ error: "Missing seller_email, product_name or product_id" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        const marketUrl = Deno.env.get("SITE_URL") ?? "https://www.casagrown.com";
        const shareUrl = `${marketUrl}/my-booth/products?share=${product_id}`;
        const subject = `🌱 Your listing "${product_name}" is now live!`;

        const htmlBody = wrapInBrandedTemplate({
            title: "Product Listing Approved",
            greeting: `Hi ${seller_name || "there"},`,
            bodyHtml: `
              <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
                Great news! Your product <strong>"${product_name}"</strong> has passed review and is now live on the CasaGrown Marketplace.
              </p>

              <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                Share your listing with your neighborhood WhatsApp groups, Nextdoor, Facebook, or text them individually to spread the word in your neighborhood and sell your items faster.
              </p>

              ${actionButton("📣 Share Listing", shareUrl)}
            `,
            footer: "CasaGrown Market &middot; Fresh. Local. Trusted."
        });

        await sendTransactionEmail({
            to: seller_email,
            subject,
            htmlBody,
        });

        console.log(
            `📧 Approved product email sent to ${seller_email} for "${product_name}"`,
        );

        return new Response(
            JSON.stringify({ ok: true }),
            { headers: { "Content-Type": "application/json" } },
        );
    } catch (err) {
        console.error("❌ notify-product-approved error:", err);
        return new Response(
            JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }
});
