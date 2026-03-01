import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('point_ledger')
    .select('id, type, amount, reference_id, metadata')
    .order('created_at', { ascending: false })
    .limit(6);
    
  console.log(JSON.stringify(data, null, 2));
}

run();
