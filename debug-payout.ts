import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

async function test() {
  const { data, error } = await supabase.functions.invoke('process-selected-payouts', {
    body: { redemption_ids: ['some-id'] }
  })
  console.log("Data:", data)
  console.log("Error:", error)
}
test()
