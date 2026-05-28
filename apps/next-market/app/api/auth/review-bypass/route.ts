import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json()

    // 1. Double check the input
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and passcode are required' }, { status: 400 })
    }

    const reviewerEmail = email.toLowerCase()
    const REVIEW_EMAILS = ['apple@casagrown.com', 'google@casagrown.com', 'facebook@casagrown.com']

    // 2. Verify it is a valid reviewer email and the hardcoded passcode
    if (!REVIEW_EMAILS.includes(reviewerEmail) || code !== '123456') {
      return NextResponse.json({ error: 'Invalid reviewer credentials' }, { status: 401 })
    }

    // 3. Initialize secure Supabase admin client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 4. Generate a real magiclink OTP using administrative privileges.
    // This will automatically create the user account in auth.users if it doesn't exist yet!
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: reviewerEmail,
    })

    if (error) {
      console.error('Bypass generator failed:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const realOtp = data.properties?.email_otp

    if (!realOtp) {
      return NextResponse.json({ error: 'Failed to generate bypass token' }, { status: 500 })
    }

    // 5. Return the real, valid server-generated OTP to the client
    return NextResponse.json({ otp: realOtp })

  } catch (err: any) {
    console.error('Bypass handler error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
