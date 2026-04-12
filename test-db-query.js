const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('market_products').select('name, window_dates, product_delivery_windows, product_pickup_windows').eq('name', 'Meyer Lemons');
  console.log(JSON.stringify(data, null, 2));
}
run();
