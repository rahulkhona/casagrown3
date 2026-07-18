'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client for the Market app.
 * Uses the same Supabase instance as the community app.
 *
 * Env vars are set in .env.local (or Next.js auto-picks up NEXT_PUBLIC_ vars):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
 */
export function createClient() {
  if (process.env.VITEST) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      order: () => chain,
      limit: () => chain,
      insert: () => chain,
      update: () => chain,
      upsert: () => chain,
      delete: () => chain,
      then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
      catch: (cb: any) => Promise.resolve({ data: [], error: null }).catch(cb),
      finally: (cb: any) => Promise.resolve({ data: [], error: null }).finally(cb),
    }

    return {
      from: () => chain,
      rpc: async () => ({ data: { available_usd: 0, schedule: [] }, error: null }),
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: async () => ({ error: null }),
        signInWithOtp: async () => ({ error: null }),
        verifyOtp: async () => ({ data: { user: null }, error: null }),
      },
      functions: {
        invoke: async () => ({ data: null, error: null }),
      },
      channel: () => ({ on: () => ({ subscribe: () => {} }), unsubscribe: () => {} }),
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          getPublicUrl: () => ({ data: { publicUrl: 'https://img.test/x.jpg' } }),
        }),
      },
    } as any
  }

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  if (typeof window !== 'undefined') {
    const originalSignIn = client.auth.signInWithOtp.bind(client.auth)
    client.auth.signInWithOtp = async (credentials) => {
      // Unconditionally capture first touch page path if not already done
      const pathKey = 'casagrown_first_page'
      if (!localStorage.getItem(pathKey)) {
        let path = window.location.pathname
        if (path.startsWith('/p/')) {
          path = '/p/[slug]'
        }
        localStorage.setItem(pathKey, path)
      }
      const firstPage = localStorage.getItem(pathKey) || 'organic'

      const options = credentials.options || {}
      const data = options.data || {}

      let signupSource = firstPage
      let firstTouchSource = 'organic'
      let utmSource = null
      let utmMedium = null
      let utmCampaign = null

      try {
        const stored = localStorage.getItem('casagrown_referral')
        if (stored) {
          const state = JSON.parse(stored)
          const lastTouch = state.last_touch || state.first_touch
          const firstTouch = state.first_touch || state.last_touch
          if (firstTouch?.source) firstTouchSource = firstTouch.source
          if (lastTouch?.utm_source) utmSource = lastTouch.utm_source
          if (lastTouch?.utm_medium) utmMedium = lastTouch.utm_medium
          if (lastTouch?.utm_campaign) utmCampaign = lastTouch.utm_campaign
        }
      } catch {}

      options.data = {
        signup_source: signupSource,
        first_touch_source: firstTouchSource,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        ...data
      }

      return originalSignIn({
        ...credentials,
        options
      })
    }
  }

  return client
}
