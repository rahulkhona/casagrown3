import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "http://127.0.0.1:54321"
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabaseAdmin.from('redemptions').insert({
    user_id: '15d38ccb-b0b3-463d-b4ef-5b9d5c58a5ae', // fake UUID for testing constraint errors
    item_id: null,
    point_cost: 500,
    status: 'pending',
    metadata: {
      type: 'venmo_refund',
      usd_amount: 5,
      bucket_ids: ['placeholder-id']
    }
  }).select()
  console.log("Error:", JSON.stringify(error, null, 2))
  console.log("Data:", JSON.stringify(data, null, 2))
}

test()
