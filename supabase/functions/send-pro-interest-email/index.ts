/**
 * send-pro-interest-email — CasaGrown Pro Interest Email
 *
 * Lightweight user-facing edge function that:
 * 1. Authenticates the user via JWT (same pattern as manage-subscription)
 * 2. Fetches user profile + email
 * 3. Builds a Pro interest email using shared templates
 * 4. Sends via the shared postmark/mailpit helper
 */

import {
    jsonError,
    jsonOk,
    serveWithCors,
    requireAuth,
} from "../_shared/serve-with-cors.ts";
import { sendTransactionEmail } from "../_shared/postmark.ts";
import {
    wrapInBrandedTemplate,
    infoCard,
    actionButton,
} from "../_shared/email-templates.ts";

// ─── Handler ────────────────────────────────────────────────────────────────

serveWithCors(async (req, { supabase, corsHeaders, siteUrl }) => {
    // 1. Authenticate
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth; // 401
    const userId = auth;

    if (userId === "service_role") {
        return jsonError("User auth required", corsHeaders, 403);
    }

    console.log(`[Pro Interest] Authenticated user: ${userId}`);

    // 2. Fetch user profile
    const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId)
        .single();

    if (profileErr || !profile) {
        console.error("Profile fetch error:", profileErr?.message);
        return jsonError("Could not load profile", corsHeaders, 500);
    }

    // 3. Get user email — from profile or auth
    let userEmail = profile.email;
    if (!userEmail) {
        try {
            const { data: { user: authUser } } =
                await supabase.auth.admin.getUserById(userId);
            userEmail = authUser?.email;
        } catch {
            // admin API may not be available
        }
    }

    if (!userEmail) {
        return jsonError("Could not determine user email", corsHeaders, 500);
    }

    const userName = profile.full_name || "there";
    console.log(`[Pro Interest] Sending email to ${userEmail} (${userName})`);

    // 4. Fetch current pricing from platform_settings
    const { data: cfg } = await supabase
        .from("platform_settings")
        .select("pro_monthly_price_usd, standard_platform_fee, pro_platform_fee, pro_free_trial_days, pro_stripe_fee_handling")
        .limit(1)
        .single();

    const monthlyPrice = cfg?.pro_monthly_price_usd ?? 10;
    const freeTrialDays = cfg?.pro_free_trial_days ?? 0;
    // Fees stored as decimals (0.10 = 10%), convert to percentages for display
    const standardFee = (cfg?.standard_platform_fee ?? 0.10) * 100;
    const proFee = (cfg?.pro_platform_fee ?? 0.02) * 100;

    // 5. Check for active discounts
    const { data: discounts } = await supabase
        .from("user_subscription_discounts")
        .select("discount_pct, duration_months, promo_name")
        .eq("user_id", userId)
        .eq("active", true)
        .gte("expires_at", new Date().toISOString())
        .limit(1);

    const discount = discounts?.[0] ?? null;

    // 6. Generate magic link for seamless email → web login → /pro checkout
    const baseUrl = siteUrl || "https://www.casagrown.com";
    let activateUrl = `${baseUrl}/pro`; // fallback

    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: userEmail,
        options: { redirectTo: `${baseUrl}/pro` },
      });

      if (linkData?.properties?.action_link && !linkError) {
        activateUrl = linkData.properties.action_link;
        console.log(`[Pro Interest] Magic link generated for ${userEmail}`);
      } else {
        console.warn(`[Pro Interest] Magic link failed, using plain URL:`, linkError?.message);
      }
    } catch (err) {
      console.warn(`[Pro Interest] Magic link error, using plain URL:`, err);
    }
    const subject = discount
        ? `${userName}, your CasaGrown Pro offer is ready 🎁`
        : `${userName}, here's your CasaGrown Pro info 🚜`;

    // Pricing
    const stripeFeeHandling = cfg?.pro_stripe_fee_handling ?? "pass_through";
    const pricingRows: Array<{ label: string; value: string }> = [
        { label: "Monthly Price", value: `$${monthlyPrice.toFixed(2)}/mo` },
        { label: "Platform Fee", value: `${proFee}% per sale` },
    ];
    if (stripeFeeHandling === "pass_through") {
        pricingRows.push({ label: "Payment Processing", value: "Stripe fees (2.9% + 30¢) passed through" });
    }
    if (freeTrialDays > 0) {
        pricingRows.unshift({
            label: "Free Trial",
            value: `${freeTrialDays} days — no charge`,
        });
    }

    // Discount section
    let discountHtml = "";
    if (discount) {
        const discountedPrice = monthlyPrice * (1 - discount.discount_pct / 100);
        discountHtml = `
<div style="margin: 20px 0; padding: 16px 20px; background: linear-gradient(135deg, #fef3c7, #fde68a); border: 1px solid #f59e0b; border-radius: 12px;">
<p style="margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #92400e;">
🎁 You've unlocked a special offer${discount.promo_name ? ` — ${discount.promo_name}` : ""}
</p>
<p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.6;">
<strong>${discount.discount_pct}% off</strong> your first${discount.duration_months > 1 ? ` ${discount.duration_months} months` : " month"} —
just <strong>$${discountedPrice.toFixed(2)}/mo</strong> instead of $${monthlyPrice.toFixed(2)}.
</p>
</div>`;
    }

    const bodyHtml = `
<!-- HOOK — Aspirational vision -->
<p style="margin: 0 0 20px; font-size: 15px; color: #1a1a2e; line-height: 1.7;" class="email-text">
Imagine showing up to the farmers market and <strong>everything is already sold</strong>. No guessing how much to bring. No hauling produce back home. Just happy buyers picking up what they already paid for.
</p>

<p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #374151;" class="email-text">
But right now, it probably looks more like this:
</p>

<ul style="margin: 0 0 20px; padding-left: 20px; font-size: 13px; color: #374151; line-height: 2;" class="email-text">
<li>You post on Facebook Marketplace, but <strong>lose sales because you couldn't reply fast enough</strong></li>
<li>You send WhatsApp messages about your drop-off schedule and <strong>dozens of replies flood in</strong> — hard to track who wants what</li>
<li>Buyers message back and forth on <strong>when and where to meet</strong> — and half of them ghost</li>
<li>You show up to market or a parking lot and <strong>haul home what didn't sell</strong></li>
</ul>

<p style="margin: 0 0 24px; font-size: 13px; color: #666666; line-height: 1.6;" class="email-text">
<strong>CasaGrown Pro</strong> fixes all of that. Here's how:
</p>

<!-- HERO BENEFIT 1 -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px;">
<tr>
<td style="width: 4px; background: #22c55e; border-radius: 4px 0 0 4px;"></td>
<td style="padding: 14px 16px;">
<p style="margin: 0 0 6px; font-size: 15px; font-weight: 700; color: #22c55e;">
📦 Confirmed Pre-Sales, Zero Chaos
</p>
<p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.6;" class="email-text">
No more tracking WhatsApp replies or chasing down who wanted what. Buyers <strong style="color: #e5e7eb;">pre-purchase and pay upfront</strong> through your booth page — you get a clean list of confirmed orders before you even load the truck. Plus, buyers picking up pre-orders <strong style="color: #e5e7eb;">drive more foot traffic to your booth</strong> and often buy more on the spot.
</p>
</td>
</tr>
</table>

<!-- HERO BENEFIT 2 -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px;">
<tr>
<td style="width: 4px; background: #3b82f6; border-radius: 4px 0 0 4px;"></td>
<td style="padding: 14px 16px;">
<p style="margin: 0 0 6px; font-size: 15px; font-weight: 700; color: #60a5fa;">
📘 Your Facebook Page Becomes a Storefront
</p>
<p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.6;" class="email-text">
Every item you add is <strong style="color: #e5e7eb;">automatically posted to your Facebook page</strong> — a live catalog that updates itself. Followers browse and buy directly, no DMs or text threads needed.
</p>
</td>
</tr>
</table>

<!-- HERO BENEFIT 3 -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px;">
<tr>
<td style="width: 4px; background: #a855f7; border-radius: 4px 0 0 4px;"></td>
<td style="padding: 14px 16px;">
<p style="margin: 0 0 6px; font-size: 15px; font-weight: 700; color: #c084fc;">
🤖 GrowBot Sells While You're Busy
</p>
<p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.6;" class="email-text">
Stop losing sales because you couldn't reply in time. GrowBot <strong style="color: #e5e7eb;">instantly answers buyer questions and takes pre-orders</strong> on Facebook Messenger and CasaGrown — even while you're at the farm, driving your route, or asleep.
</p>
</td>
</tr>
</table>

<!-- CTA -->
${actionButton("Start Growing with Pro →", activateUrl)}

<!-- COMPACT EXTRAS -->
<p style="margin: 20px 0 0; font-size: 12px; color: #9ca3af; line-height: 1.8; text-align: center;" class="email-text">
Also included: 📱 WhatsApp booth sharing · 🏪 Multiple booths · 🌱 Gardening service provider tools · 💰 Just ${proFee}% platform fee
</p>

${discountHtml}

<!-- PRICING -->
${infoCard(pricingRows)}

<!-- URGENCY -->
<div style="margin: 16px 0; padding: 14px 16px; text-align: center; border-radius: 8px; border: 1px dashed #22c55e;">
<p style="margin: 0; font-size: 13px; color: #22c55e; font-weight: 600;" class="email-text">
🌱 We're just launching Pro — early adopters lock in this price forever.
</p>
</div>

<!-- FINAL CTA -->
${actionButton("Activate CasaGrown Pro", activateUrl)}

<!-- GUARANTEE -->
<p style="margin: 16px 0 0; font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.6;">
🛡️ Month-to-month · Cancel anytime · Full refund within 7 days
</p>`;

    const htmlBody = wrapInBrandedTemplate({
        title: "CasaGrown Pro",
        greeting: `Hi ${userName}!`,
        bodyHtml,
        headerEmoji: "🚜",
    });

    // 7. Send the email
    const result = await sendTransactionEmail({
        to: userEmail,
        subject,
        htmlBody,
    });

    if (!result.success) {
        console.error(`❌ Pro interest email failed for ${userId}:`, result.error);
        return jsonError("Failed to send email", corsHeaders, 500);
    }

    console.log(`📧 Pro interest email sent to ${userEmail}`);

    // 8. Update rate-limit timestamp (fire-and-forget)
    try {
        await supabase
            .from("profiles")
            .update({ pro_interest_email_sent_at: new Date().toISOString() })
            .eq("id", userId);
    } catch {
        // Column may not exist yet — no problem
    }

    return jsonOk({ success: true }, corsHeaders);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Hero-style feature block (used for top 3 benefits in main email) */
function feature(emoji: string, title: string, description: string): string {
    return `
<tr>
<td style="padding: 10px 0; vertical-align: top; width: 36px;">
<span style="font-size: 20px;">${emoji}</span>
</td>
<td style="padding: 10px 0 10px 8px; vertical-align: top; border-bottom: 1px solid #f0f0f0;">
<p style="margin: 0 0 2px; font-size: 14px; font-weight: 600; color: #1a1a2e;">${title}</p>
<p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5;">${description}</p>
</td>
</tr>`;
}

/** Compact benefit row for the "Plus" section */
function benefitRow(emoji: string, title: string, description: string): string {
    return `
<tr>
<td style="padding: 6px 0; vertical-align: top; width: 28px;">
<span style="font-size: 16px;">${emoji}</span>
</td>
<td style="padding: 6px 0 6px 6px; vertical-align: top;">
<p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;" class="email-text">
<strong style="color: #e5e7eb;">${title}</strong> — ${description}
</p>
</td>
</tr>`;
}
