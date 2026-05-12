require('dotenv').config({path: '.env'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.rpc('nearby_booths', {
      user_lat: 39.8283, user_lng: -98.5795, max_miles: 999,
      fulfillment_filter: 'all', product_search: null,
      min_price: null, max_price: null, category_filter: null,
      buyer_state_code: null, exclude_demos: false,
      p_limit: 30, p_offset: 0,
  });
  console.log("Error:", error);
  console.log("Data length:", data ? data.length : null);
  if (data && data.length > 0) {
    const demos = data.filter(b => b.is_demo);
    console.log("Demos count:", demos.length);
  }
}
test();
