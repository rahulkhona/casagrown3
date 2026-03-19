/**
 * Admin Supabase client using the service_role key.
 * ⚠️  SERVER-SIDE ONLY — must never be imported from client components.
 *
 * All admin dashboard operations now go through /api/admin (route.ts),
 * which uses this client internally. This file is kept for backward
 * compatibility but will throw at runtime if loaded in the browser.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    'adminSupabase must NOT be used in client-side code. ' +
    'Use the adminApi helper (lib/adminApi.ts) instead, which calls ' +
    'the server-side /api/admin route.'
  )
}

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY 
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
