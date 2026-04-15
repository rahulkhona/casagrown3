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

  await sendTransactionEmail({ to, subject, htmlBody: html, textBody: text })

  console.log(`[send-market-email] Sent to ${to}: ${subject}`)

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
