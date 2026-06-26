import { NextResponse } from 'next/server'

/**
 * POST /api/crm/send-test-email
 * 
 * Sends a test email via Postmark broadcast stream.
 * Used by the SequenceBuilder to test individual node emails.
 * 
 * Body: { to: string, subject: string, html_body: string, text_body?: string }
 */
export async function POST(request: Request) {
  try {
    const { to, subject, html_body, text_body } = await request.json()

    if (!to || !subject || !html_body) {
      return NextResponse.json(
        { error: 'to, subject, and html_body are required' },
        { status: 400 }
      )
    }

    const token = process.env.POSTMARK_SERVER_TOKEN || process.env.POSTMARK_BROADCAST_TOKEN
    if (!token) {
      return NextResponse.json(
        { error: 'Postmark token not configured' },
        { status: 500 }
      )
    }

    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: process.env.POSTMARK_FROM_EMAIL || 'hello@casagrown.com',
        To: to,
        Subject: subject,
        HtmlBody: html_body,
        TextBody: text_body || '',
        MessageStream: 'broadcast',
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.Message || `Postmark error (${res.status})` },
        { status: res.status }
      )
    }

    return NextResponse.json({ success: true, messageId: data.MessageID })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
