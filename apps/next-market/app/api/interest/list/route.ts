import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getProduceFamilies } from '../../../../lib/produceCatalog'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fzdmszvfeewpwswlnfyk.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const email = searchParams.get('email')?.trim().toLowerCase()
    const userId = searchParams.get('user_id')?.trim()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    let leadId: string | null = null

    if (email) {
      const { data: leadData } = await supabase
        .from('crm_leads')
        .select('id')
        .ilike('email', email)
        .maybeSingle()

      if (leadData?.id) {
        leadId = leadData.id
      }
    }

    const userInterests: any[] = []

    if (userId) {
      const { data: byUser } = await supabase
        .from('crm_produce_interests')
        .select('id, produce_name, interest_type, produce_category, zipcodes, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (byUser) userInterests.push(...byUser)
    }

    if (leadId) {
      const { data: byLead } = await supabase
        .from('crm_produce_interests')
        .select('id, produce_name, interest_type, produce_category, zipcodes, status, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

      if (byLead) {
        for (const item of byLead) {
          if (!userInterests.some((i) => i.id === item.id)) {
            userInterests.push(item)
          }
        }

        if (userId) {
          void supabase
            .from('crm_produce_interests')
            .update({ user_id: userId })
            .eq('lead_id', leadId)
        }
      }
    }

    // 4. Calculate matching buyer demand for user's selling interests (broad family-level matching)
    const sellProduceNames = userInterests
      .filter((i) => i.interest_type === 'sell' && i.status === 'active')
      .map((i) => i.produce_name)

    const sellFamilies = new Set(sellProduceNames.flatMap(getProduceFamilies))

    let demandItems: { produce_name: string; count: number }[] = []

    if (sellFamilies.size > 0) {
      const { data: demandData } = await supabase
        .from('crm_produce_interests')
        .select('produce_name')
        .eq('interest_type', 'buy')
        .eq('status', 'active')

      if (demandData && demandData.length > 0) {
        const counts: Record<string, number> = {}
        demandData.forEach((row: any) => {
          if (row.produce_name) {
            const buyerFamilies = getProduceFamilies(row.produce_name)
            if (buyerFamilies.some((f) => sellFamilies.has(f))) {
              counts[row.produce_name] = (counts[row.produce_name] || 0) + 1
            }
          }
        })
        demandItems = Object.entries(counts).map(([produce_name, count]) => ({ produce_name, count }))
      }
    }

    return NextResponse.json({
      success: true,
      interests: userInterests,
      demandItems,
      matchedSellInterestsCount: sellProduceNames.length,
    })
  } catch (error: any) {
    console.error('Error fetching produce interests list:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
