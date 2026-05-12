require('dotenv').config({path: '.env'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data } = await supabase.rpc('nearby_booths', {
      user_lat: 34.0522, user_lng: -118.2437, max_miles: 10,
      fulfillment_filter: 'all', product_search: null,
      min_price: null, max_price: null, category_filter: null,
      buyer_state_code: 'CA', exclude_demos: false,
      p_limit: 30, p_offset: 0,
  });
  console.log("Matched products for demo 0:", data[0].matched_products);
}
test();
