const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: booths } = await supabase.from('market_booths').select('id, name, is_open, status').ilike('name', '%Demo%');
  console.log('Demo Booths:', booths);
  
  if (booths && booths.length) {
    const { data: products } = await supabase.from('market_products').select('id, name, status, moderation_status').eq('booth_id', booths[0].id);
    console.log('Products for first demo booth:', products);
  }
}
run();
