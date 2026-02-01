// scripts/check_profiles.ts
// Run with: npx ts-node scripts/check_profiles.ts

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://127.0.0.1:54321'
// Default Supabase local anon key (same for all local instances)
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
// Service role key for admin access
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

async function main() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log('\\n🔍 Fetching Profiles...\\n')

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, referral_code, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching profiles:', error.message)
    return
  }

  if (!profiles || profiles.length === 0) {
    console.log('No profiles found.')
    return
  }

  console.log('Found', profiles.length, 'profiles:\\n')
  profiles.forEach((p, i) => {
    console.log(`${i + 1}. ${p.email || '(no email)'}`)
    console.log(`   Full Name: ${p.full_name || '(not set)'}`)
    console.log(`   Referral Code: ${p.referral_code || '(none)'}`)
    console.log(`   Created: ${new Date(p.created_at).toLocaleString()}`)
    console.log('')
  })
}

main()
