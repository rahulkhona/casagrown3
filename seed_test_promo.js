const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Seeding custom test promotion slug "super-deal"...')
  
  // 1. Clean up existing landing page slug "super-deal" if it exists
  const { data: existingPage } = await supabase
    .from('crm_landing_pages')
    .select('id')
    .eq('slug', 'super-deal')
    .maybeSingle()
    
  if (existingPage) {
    console.log('Found existing "super-deal" page, cleaning up...')
    // Cascade deletes will clean up promotions, discounts, etc.
    await supabase.from('crm_landing_pages').delete().eq('id', existingPage.id)
  }

  // 2. Insert Landing Page
  const { data: page, error: pageErr } = await supabase
    .from('crm_landing_pages')
    .insert({
      slug: 'super-deal',
      title: 'CasaGrown Summer Launch Deal',
      is_active: true,
      hero_image_url: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80'
    })
    .select()
    .single()

  if (pageErr) {
    console.error('Error seeding landing page:', pageErr)
    return
  }
  console.log('Created landing page id:', page.id)

  // 3. Insert Promotion
  const { data: promo, error: promoErr } = await supabase
    .from('crm_promotions')
    .insert({
      landing_page_id: page.id,
      name: 'Summer Launch Special',
      description_html: '<p>Supercharge your local farm or garden stand with our premier launch pricing! Get exclusive discounts across all tiers, free universal credits, and our canvas tote bag shipped free to your door.</p>',
      enrollment_deadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year future
      allow_existing_users: true,
      max_enrollees: 1000,
      current_enrollees: 0
    })
    .select()
    .single()

  if (promoErr) {
    console.error('Error seeding promotion:', promoErr)
    return
  }
  console.log('Created promotion id:', promo.id)

  // 4. Insert dynamic Pro subscription discount
  const { error: proErr } = await supabase
    .from('crm_promo_subscription_discounts')
    .insert({
      promotion_id: promo.id,
      plan: 'pro',
      discount_pct: 25, // 25% Off Pro
      duration_months: 6, // for 6 months
      platform_fee_reduction_pct: 2, // 5% -> 3% platform fee
      stripe_fee_handling_override: 'absorb' // absorb Stripe fees
    })

  if (proErr) {
    console.error('Error seeding Pro discount:', proErr)
  } else {
    console.log('Seeded Pro pricing overrides (25% off, 3% platform fee, absorb Stripe fees).')
  }

  // 5. Insert dynamic Elite subscription discount
  const { error: eliteErr } = await supabase
    .from('crm_promo_subscription_discounts')
    .insert({
      promotion_id: promo.id,
      plan: 'elite',
      discount_pct: 30, // 30% Off Elite
      duration_months: 12, // for 12 months
      platform_fee_reduction_pct: 1, // 2% -> 1% platform fee
      stripe_fee_handling_override: 'pass_through' // pass-through Stripe fees
    })

  if (eliteErr) {
    console.error('Error seeding Elite discount:', eliteErr)
  } else {
    console.log('Seeded Elite pricing overrides (30% off, 1% platform fee, pass-through Stripe fees).')
  }

  // 6. Seed Giveaway Item
  const { error: giveawayErr } = await supabase
    .from('crm_promo_giveaways')
    .insert({
      promotion_id: promo.id,
      title: 'Premium Organic Canvas Tote Bag',
      description: 'Get our limited-edition 100% organic canvas market tote bag shipped free to your door when you upgrade or sign up!',
      start_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      photos: ['https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=300&q=80']
    })

  if (giveawayErr) {
    console.error('Error seeding giveaway:', giveawayErr)
  } else {
    console.log('Seeded canvas tote bag physical giveaway details.')
  }

  // 7. Seed Credits blueprint
  const { error: creditsErr } = await supabase
    .from('crm_promo_buyer_discounts')
    .insert({
      promotion_id: promo.id,
      discount_amount_usd: 15.00, // $15 Universal credits
      discount_type: 'universal',
      discount_cap_type: 'percentage',
      discount_cap_value: 50, // covers 50% of orders
      frequency: 'monthly',
      occurrences: 3, // for 3 months
      start_date: new Date().toISOString(),
      image_url: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=300&q=80'
    })

  if (creditsErr) {
    console.error('Error seeding credits:', creditsErr)
  } else {
    console.log('Seeded $15.00 Universal monthly credits for 3 months.')
  }

  console.log('\n🎉 Test campaign seeded successfully!')
  console.log('👉 Access the live landing page at: http://localhost:3001/p/super-deal')
}
run()
