// supabase/functions/send-market-email/index.ts
// Edge function: sends transactional emails via SMTP (Mailpit local / Postmark prod)
//
// Expects SMTP_HOST, SMTP_PORT, SMTP_FROM env vars.
// Uses raw SMTP protocol via Deno's TCP, or falls back to fetch-based API.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRequest {
  to: string
  subject: string
  html: string
  text?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, html, text } = (await req.json()) as EmailRequest

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const smtpHost = Deno.env.get('SMTP_HOST') || 'localhost'
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '1025', 10)
    const smtpFrom = Deno.env.get('SMTP_FROM') || 'market@casagrown.com'

    // Use Mailpit HTTP API in development (port 8025)
    // Mailpit accepts standard SMTP on port 1025 and has an API on 8025
    const mailpitApiUrl = `http://${smtpHost}:8025/api/v1/send`
    
    const emailPayload = {
      From: { Email: smtpFrom, Name: 'CasaGrown Market' },
      To: [{ Email: to }],
      Subject: subject,
      HTML: html,
      Text: text || subject,
    }

    const response = await fetch(mailpitApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    })

    if (!response.ok) {
      // Fallback: try direct SMTP via Deno TCP
      console.warn('[EMAIL] Mailpit API failed, trying raw SMTP...')
      const conn = await Deno.connect({ hostname: smtpHost, port: smtpPort })
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()

      const send = async (data: string) => {
        await conn.write(encoder.encode(data + '\r\n'))
        const buf = new Uint8Array(1024)
        const n = await conn.read(buf)
        return n ? decoder.decode(buf.subarray(0, n)) : ''
      }

      await send('') // read greeting
      await send(`EHLO casagrown.com`)
      await send(`MAIL FROM:<${smtpFrom}>`)
      await send(`RCPT TO:<${to}>`)
      await send('DATA')
      
      const boundary = `----=_Part_${Date.now()}`
      const message = [
        `From: CasaGrown Market <${smtpFrom}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        text || subject,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        html,
        '',
        `--${boundary}--`,
        '.',
      ].join('\r\n')

      await conn.write(encoder.encode(message + '\r\n'))
      const buf = new Uint8Array(1024)
      await conn.read(buf)
      await send('QUIT')
      conn.close()
    }

    console.log(`[EMAIL] Sent to ${to}: ${subject}`)

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('[EMAIL] Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
