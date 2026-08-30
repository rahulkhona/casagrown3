import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkTextForViolations } from '../../../../lib/moderation'
import { normalizeProduceKey } from '../../../../lib/bulkListingUtils'

const PROCESSED_NON_HARVEST_REGEX = /\b(pie|tart|cake|bread|focaccia|sourdough|pastry|cookie|jam|jelly|canned|soup|salsa|pickle|meal|sandwich|baked|loaf|loaves|muffin|cupcake|brownie)\b/i

function isRawHarvestProduce(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  return !PROCESSED_NON_HARVEST_REGEX.test(name)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const rawZip = searchParams.get('zipcode') || searchParams.get('zip')
    const cleanZip = rawZip ? rawZip.trim().replace(/[^0-9]/g, '') : ''

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    let query = supabase
      .from('crm_produce_interests')
      .select('produce_name, zipcodes, lead_id, user_id')
      .eq('interest_type', 'buy')
      .eq('status', 'active')

    if (cleanZip && cleanZip.length === 5) {
      query = query.contains('zipcodes', [cleanZip])
    }

    const { data, error } = await query.limit(5000)

    if (error) {
      console.error('[API /api/interest/demand] Query error:', error)
      return NextResponse.json({
        success: false,
        totalBuyers: 0,
        locationLabel: cleanZip ? `In ${cleanZip}` : 'In Your Area',
        produceCounts: {},
        demandedItems: [],
      })
    }

    const counts: Record<string, number> = {}
    const rawCounts: Record<string, number> = {}
    const displayNames: Record<string, string> = {}
    const uniqueBuyers = new Set<string>()

    if (data && data.length > 0) {
      data.forEach((item: any) => {
        const rawName = (item.produce_name || '').trim()
        if (!rawName) return

        // 1. Content Moderation & Banned Items Check
        const modCheck = checkTextForViolations(rawName)
        if (!modCheck.isClean) return

        // 2. Non-harvest processed items check
        if (!isRawHarvestProduce(rawName)) return

        const norm = rawName.toLowerCase()
        rawCounts[norm] = (rawCounts[norm] || 0) + 1
        if (!displayNames[norm]) {
          displayNames[norm] = rawName.charAt(0).toUpperCase() + rawName.slice(1)
        }

        const keys = normalizeProduceKey(norm)
        keys.forEach((k) => {
          counts[k] = (counts[k] || 0) + 1
        })

        const buyerId = item.user_id || item.lead_id || `${norm}_${Math.random()}`
        uniqueBuyers.add(buyerId)
      })
    }

    const totalBuyers = uniqueBuyers.size
    const demandedItems = Object.entries(rawCounts).map(([norm, count]) => ({
      produce_name: displayNames[norm] || norm,
      count,
    }))

    return NextResponse.json({
      success: true,
      zipcode: cleanZip || null,
      totalBuyers,
      locationLabel: cleanZip ? `In ${cleanZip}` : 'In Your Area',
      produceCounts: counts,
      demandedItems,
    })
  } catch (err: any) {
    console.error('[API /api/interest/demand] Error:', err)
    return NextResponse.json({
      success: false,
      totalBuyers: 0,
      locationLabel: 'In Your Area',
      produceCounts: {},
    })
  }
}
