const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: promos } = await supabase.from('crm_promotions').select('*')
  console.log('Promotions:', promos)
  
  const { data: enrollments } = await supabase.from('crm_promo_enrollments').select('*')
  console.log('Enrollments:', enrollments)

  const { data: blueprints } = await supabase.from('crm_promo_buyer_discounts').select('*')
  console.log('Blueprints:', blueprints)
}
run()
