/**
 * Client-side Supabase client for next-admin (anon key).
 * Used by client components that need to call Edge Functions.
 * For privileged server-side operations, use adminSupabase instead.
 */
import { createClient as _create } from '@supabase/supabase-js'

export function createClient() {
  return _create(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
