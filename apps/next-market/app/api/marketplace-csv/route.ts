import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const boothId = req.nextUrl.searchParams.get('boothId')
  if (!boothId) {
    return NextResponse.json({ error: 'Missing boothId' }, { status: 400 })
  }

  // Auth check
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const authHeader = req.headers.get('authorization') || ''
  const cookieHeader = req.headers.get('cookie') || ''
  
  // Try to get token from Authorization header or cookies
  let token = authHeader.replace('Bearer ', '')
  if (!token) {
    // Extract from sb-* access token cookie
    const match = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/)
    if (match) {
      try {
        const parsed = JSON.parse(decodeURIComponent(match[1]))
        token = parsed?.[0] || parsed?.access_token || ''
      } catch { token = '' }
    }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify Pro or Elite subscription
  const { data: sub } = await supabase
    .from('seller_subscriptions')
    .select('plan, status')
    .eq('user_id', user.id)
    .single()

  if (!sub || !['pro', 'elite'].includes(sub.plan) || !['active', 'trialing'].includes(sub.status)) {
    return NextResponse.json({ error: 'Pro or Elite subscription required' }, { status: 403 })
  }

  // Verify booth belongs to user
  const { data: booth } = await supabase
    .from('market_booths')
    .select('id, name, owner_id, offers_pickup, offers_delivery, pickup_address, delivery_radius_miles, delivery_zipcodes')
    .eq('id', boothId)
    .eq('owner_id', user.id)
    .single()

  if (!booth) {
    return NextResponse.json({ error: 'Booth not found' }, { status: 404 })
  }

  // Load products
  const { data: products } = await supabase
    .from('market_products')
    .select('id, name, description, price_usd, unit, inventory, category, photos')
    .eq('booth_id', boothId)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('created_at')

  if (!products || products.length === 0) {
    return NextResponse.json({ error: 'No active products in this booth' }, { status: 404 })
  }

  // Load seller profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, farm_name, city, zip_code')
    .eq('id', user.id)
    .single()

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://casagrown.com'
  const brand = profile?.farm_name || profile?.full_name || 'CasaGrown Seller'
  const sellerLocation = [profile?.city, profile?.zip_code].filter(Boolean).join(' ')

  // Build fulfillment description
  let fulfillment = ''
  if (booth.offers_pickup && booth.pickup_address) {
    fulfillment += `📍 Pickup: ${booth.pickup_address}`
  }
  if (booth.offers_delivery) {
    fulfillment += `${fulfillment ? ' | ' : ''}🚗 Delivery available`
    if (booth.delivery_radius_miles) {
      fulfillment += ` within ${booth.delivery_radius_miles} miles`
    }
  }

  // CSV Header
  const headers = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'category', 'additional_image_link', 'inventory', 'item_group_id']

  // CSV Rows
  const rows = products.map((p: any) => {
    const price = `${Number(p.price_usd).toFixed(2)} USD`
    const desc = [p.description || p.name, fulfillment ? `\n\n${fulfillment}` : '', `\n\nOrder online: ${siteUrl}/market/booth/${boothId}/product/${p.id}`].join('')
    const mainImage = p.photos?.[0] || `${siteUrl}/logo.png`
    const additionalImages = (p.photos || []).slice(1, 5).join(',')
    const title = sellerLocation ? `${p.name} · ${sellerLocation}` : p.name

    return [
      p.id,
      title,
      desc.substring(0, 5000),
      p.inventory > 0 ? 'in stock' : 'out of stock',
      'new',
      price,
      `${siteUrl}/market/booth/${boothId}/product/${p.id}`,
      mainImage,
      brand,
      p.category || 'Food, Beverages & Tobacco',
      additionalImages,
      String(p.inventory),
      boothId,
    ]
  })

  // Build CSV string
  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map((v: string) => escapeCsv(v)).join(',')),
  ].join('\n')

  // Add UTF-8 BOM for Excel compatibility
  const bom = '\uFEFF'
  const safeName = booth.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

  return new NextResponse(bom + csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="marketplace-listings-${safeName}.csv"`,
    },
  })
}
