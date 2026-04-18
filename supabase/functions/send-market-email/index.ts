// supabase/functions/send-market-email/index.ts
//
// Sends transactional notification emails for market events (order status,
// settlement cleared, earnings available, etc.) via Postmark.
//
// Called by DB triggers via net.http_post from notify_market_event().
//
// Required env vars (Supabase secrets):
//   POSTMARK_SERVER_TOKEN  — Postmark server API token
//   POSTMARK_FROM_EMAIL    — Verified sender address
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
  const { to, subject, html, text } = (await req.json()) as EmailRequest

  if (!to || !subject || !html) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:3000";

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
    if (text?.includes('Withdrawal complete')) title = "Redemption Complete";

    const lines = text?.split('\n') || [];
    let messageText = lines[0] || 'You have a new notification.';
    let linkUrl = lines.length > 1 ? lines[lines.length - 1] : null;

    if (linkUrl && linkUrl.startsWith('http')) {
       // Filter out the link from the text so we can make it a button
       messageText = messageText.replace(linkUrl, '').trim();
       bodyHtml = \`
         <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">\${messageText}</p>
         \${actionButton("View Details", linkUrl)}
       \`;
    } else {
       messageText = text || '';
       bodyHtml = \`<p style="margin: 0 0 16px; font-size: 14px; color: #374151;">\${messageText}</p>\`;
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

  await sendTransactionEmail({ to, subject, htmlBody: finalHtml, textBody: text })

  console.log(\`[send-market-email] Sent to \${to}: \${subject}\`)

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
