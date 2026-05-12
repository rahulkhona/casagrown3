require('dotenv').config({path: '.env'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data } = await supabase.from('market_schedule_policies').select('*').eq('is_enabled', true);
  console.log(data);
}
test();
