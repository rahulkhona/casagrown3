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
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
