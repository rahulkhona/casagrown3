import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Server-side PKCE code exchange handler.
 * 
 * This runs on the server, completely bypassing browser navigator.locks
 * which hang indefinitely after OAuth redirect chains on Vercel/Next.js 16.
 *
 * Flow:
 * 1. Login page initiates OAuth → Google/Apple → Supabase
 * 2. Supabase redirects to /auth-callback?code=xxx
 * 3. auth-callback page immediately redirects to /api/auth/callback?code=xxx
 * 4. THIS route handler exchanges the code server-side (no browser locks)
 * 5. Sets session cookies and redirects to final destination
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/market'
  const isNative = searchParams.get('native') === 'true'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const cookieStore = await cookies()
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Capture cookies that Supabase sets during exchangeCodeForSession
  // so we can attach them to the redirect response.
  // cookieStore.getAll() only returns REQUEST cookies, not newly set ones.
  const sessionCookies: { name: string; value: string; options: any }[] = []

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
          // Save for attaching to redirect response
          sessionCookies.push(...cookiesToSet)
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[api/auth/callback] Code exchange failed:', error.message)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  if (isNative) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const dl = `casagrown://auth-callback?access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`
      return NextResponse.redirect(dl)
    }
    return NextResponse.redirect(`${origin}/auth-callback?native=true&redirect=${encodeURIComponent(redirect)}`)
  }

  const response = NextResponse.redirect(`${origin}${redirect}`)

  // Attach the session cookies that Supabase set during code exchange
  // onto the redirect response so the browser actually stores them
  for (const { name, value, options } of sessionCookies) {
    response.cookies.set(name, value, {
      ...options,
      path: '/',
    })
  }

  return response
}
