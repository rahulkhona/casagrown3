// supabase/functions/send-market-email/index.ts
//
// Sends transactional notification emails for market events (order status,
// settlement cleared, earnings available, etc.) via Postmark.
//
// Called by DB triggers via net.http_post from notify_market_event().
//
// Required env vars (Supabase secrets):
//   POSTMARK_SERVER_TOKEN  - Postmark server API token
//   POSTMARK_FROM_EMAIL    - Verified sender address
//
// Falls back to Mailpit (local Docker) when POSTMARK_SERVER_TOKEN is not set.

import { serveWithCors } from '../_shared/serve-with-cors.ts'
import { sendTransactionEmail } from '../_shared/postmark.ts'
import { wrapInBrandedTemplate, actionButton } from '../_shared/email-templates.ts'

interface EmailRequest {
  to: string
  subject: string
  html: string
  text?: string
}

serveWithCors(async (req, { corsHeaders }) => {
  let { to, subject, html, text } = (await req.json()) as EmailRequest

  // Strip emojis and non-ASCII characters (e.g. 🛒, 📦, —, ×) from the subject
  // to prevent Mailpit/SMTP from encoding the subject as =?utf-8?Q?...
  if (subject) {
    subject = subject.replace(/[^\x00-\x7F]/g, "").replace(/\s+/g, " ").trim();
  }

  if (!to || !subject || !html) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.casagrown.com";

  let finalHtml = html;

  // Intercept SQL-generated legacy HTML payloads which bypass send-notification-email
  if (
    html.includes('CasaGrown Market &bull; Fresh &bull; Local &bull; Trusted') || 
    html.includes('FRESH • LOCAL • TRUSTED')
  ) {
    // Extract raw text content natively from the text payload built by the DB
    // Format is usually: "Hi FullName,\n\nSome message...\n\nhttp://link"
    let content = text || html.replace(/<[^>]*>?/gm, ''); // Fallback to striphp
    let title = "Market Update";
    let bodyHtml = "";

    // Specific mapping if the text indicates order states or earnings
    if (text?.includes('has been accepted')) title = "Order Accepted";
    if (text?.includes('has been delivered!')) title = "Order Delivered";
    if (text?.includes('funds received')) title = "Funds Processing";
    if (text?.includes('earnings cleared')) title = "Earnings Cleared";
    if (text?.includes('1099-K')) title = "Important Tax Notice";
    if (text?.includes('Withdrawal complete') || text?.includes('Payout completed') ||
        text?.includes('Redemption complete') || text?.includes('Redemption Complete')) title = "Payout Completed";
    if (text?.includes('Payout failed') || text?.includes('Withdrawal failed')) title = "Payout Failed";

    // Completion & sale
    if (text?.includes('Sale completed')) title = "Sale Completed";
    if (text?.includes('Order completed')) title = "Order Completed";

    // Settlement
    if (text?.includes('Daily settlement')) title = "Daily Settlement";

    // Delivery/pickup
    if (text?.includes('ready for pickup')) title = "Ready for Pickup";

    // Decline/cancel
    if (text?.includes('was declined')) title = "Order Declined";
    if (text?.includes('has been cancelled')) title = "Order Cancelled";

    // Disputes (most specific first)
    if (text?.includes('escalated to admin')) title = "Dispute Escalated";
    if (text?.includes('dispute') && text?.includes('resolved')) title = "Dispute Resolved";
    if (text?.includes('Dispute') || text?.includes('dispute')) title = "Dispute Opened";

    // New order
    if (text?.includes('New order:')) title = "New Order";

    const lines = text?.split('\n') || [];
    // The link is typically the last line if it starts with http
    const lastLine = lines.length > 0 ? lines[lines.length - 1].trim() : '';
    let linkUrl = lastLine.startsWith('http') ? lastLine : null;
    
    let messageText = '';
    if (linkUrl) {
       messageText = lines.slice(0, -1).join('<br/>').trim();
    } else {
       messageText = lines.join('<br/>').trim() || 'You have a new notification.';
    }

    if (linkUrl) {
       bodyHtml = `
         <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">${messageText}</p>
         ${actionButton("View Details", linkUrl)}
       `;
    } else {
       bodyHtml = `<p style="margin: 0 0 16px; font-size: 14px; color: #374151;">${messageText}</p>`;
    }

    finalHtml = wrapInBrandedTemplate({
      title,
      greeting: "Hi there,",
      bodyHtml
    });
  } else if (!html.includes('CasaGrown')) {
     // If it's a completely unbranded custom HTML (like stripe-webhook admin alerts)
     finalHtml = wrapInBrandedTemplate({
        title: "System Alert",
        greeting: "Hello,",
        bodyHtml: html
     });
  }

  const result = await sendTransactionEmail({ to, subject, htmlBody: finalHtml })

  console.log(`[send-market-email] Sent to ${to}: ${subject} - Success: ${result.success}`)

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
// cache bust
// cache bust 2
// cache bust 3
