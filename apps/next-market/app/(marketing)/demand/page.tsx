import { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { Navbar } from '../../components/Navbar'
import { BottomNav } from '../../components/BottomNav'
import { EXHAUSTIVE_US_PRODUCE, type ProduceItem } from '../../../lib/produceCatalog'
import { MarketProvider } from '../../../lib/store'
import { CartProvider } from '../../../lib/useCart'
import { BootstrapProvider } from '../../../lib/useBootstrap'
import { QuickSetupProvider } from '../../../lib/useQuickSetup'
import { ErrorToastProvider } from '../../components/ErrorToast'
import DemandClientView from './DemandClientView'

interface DemandPageProps {
  searchParams: Promise<{
    items?: string
    name?: string
    location?: string
    q?: string
    ref?: string
    user_id?: string
    email?: string
    type?: string
    mode?: string
  }>
}

function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 
              process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return createClient(url, key, {
    auth: { persistSession: false }
  })
}

interface ResolvedBuyerData {
  buyerId: string
  buyerName: string
  firstName: string
  buyerLocation: string
  avatarUrl: string | null
  itemNames: string[]
  mode: 'buy' | 'sell'
}

async function resolveBuyerData(searchParamsResolved: Awaited<DemandPageProps['searchParams']>): Promise<ResolvedBuyerData> {
  const { items, name, location, q, ref, user_id, email, type, mode: queryMode } = searchParamsResolved
  const identifier = ref || user_id || email

  let buyerId = identifier || ''
  let buyerName = name?.trim() || ''
  let buyerLocation = location?.trim() || ''
  let avatarUrl: string | null = null
  let rawItems = items || q || ''
  let mode: 'buy' | 'sell' = (type as any) === 'sell' || (queryMode as any) === 'sell' ? 'sell' : 'buy'

  if (identifier) {
    try {
      const supabase = getSupabaseServer()
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)

      // 1. Query profiles table by UUID or Email
      let profile: any = null
      if (isUuid) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, name, zip_code, avatar_url, email')
          .eq('id', identifier)
          .maybeSingle()
        profile = data
      } else if (identifier.includes('@')) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, name, zip_code, avatar_url, email')
          .eq('email', identifier)
          .maybeSingle()
        profile = data
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, name, zip_code, avatar_url, email')
          .or(`referral_code.eq.${identifier},dm_short_code.eq.${identifier}`)
          .maybeSingle()
        profile = data
      }

      if (profile) {
        buyerId = profile.id
        if (!buyerName) buyerName = profile.full_name || profile.name || (profile.email ? profile.email.split('@')[0] : '')
        if (!buyerLocation && profile.zip_code) buyerLocation = profile.zip_code
        if (profile.avatar_url) avatarUrl = profile.avatar_url
      }

      // 2. Query crm_leads if profile name/location still missing
      if (!buyerName || !buyerLocation) {
        let lead: any = null
        if (isUuid) {
          const { data } = await supabase
            .from('crm_leads')
            .select('name, zipcode, email, user_id')
            .or(`id.eq.${identifier},user_id.eq.${identifier}`)
            .maybeSingle()
          lead = data
        } else if (identifier.includes('@')) {
          const { data } = await supabase
            .from('crm_leads')
            .select('name, zipcode, email, user_id')
            .eq('email', identifier)
            .maybeSingle()
          lead = data
        }

        if (lead) {
          if (!buyerName && lead.name) buyerName = lead.name
          if (!buyerLocation && lead.zipcode) buyerLocation = lead.zipcode
          if (!buyerId && lead.user_id) buyerId = lead.user_id
        }
      }

      // 3. Query crm_produce_interests if produce items not specified in query params
      if (!rawItems && (buyerId || email)) {
        let interests: any[] = []
        if (buyerId && isUuid) {
          const { data } = await supabase
            .from('crm_produce_interests')
            .select('produce_name, interest_type')
            .or(`user_id.eq.${buyerId},lead_id.eq.${buyerId}`)
          if (data) interests = data
        } else if (email && email.includes('@')) {
          const { data: lead } = await supabase
            .from('crm_leads')
            .select('id')
            .ilike('email', email)
            .maybeSingle()
          
          if (lead?.id) {
            const { data } = await supabase
              .from('crm_produce_interests')
              .select('produce_name, interest_type')
              .or(`user_id.eq.${buyerId},lead_id.eq.${lead.id}`)
            if (data) interests = data
          }
        }

        if (interests && interests.length > 0) {
          if (!type && !queryMode) {
            const hasSell = interests.some((i: any) => i.interest_type === 'sell')
            if (hasSell) mode = 'sell'
          }
          const filtered = interests.filter((i: any) => i.interest_type === mode)
          if (filtered.length > 0) {
            rawItems = Array.from(new Set(filtered.map((i: any) => i.produce_name))).join(',')
          } else {
            rawItems = Array.from(new Set(interests.map((i: any) => i.produce_name))).join(',')
          }
        }
      }
    } catch (err) {
      console.error('[DemandPage] DB resolution error:', err)
    }
  }

  if (!rawItems) rawItems = 'Heirloom Tomatoes,Hass Avocados,Lemons,Sweet Bell Peppers,Figs'

  const itemNames = rawItems.split(',').map((s) => s.trim()).filter(Boolean)
  
  let firstName = 'Jane'
  if (buyerName && buyerName !== 'Local Neighbor' && buyerName !== 'A neighbor') {
    const clean = buyerName.split('@')[0].replace(/[._-]/g, ' ').trim()
    const firstWord = clean.split(/\s+/)[0]
    if (firstWord) {
      firstName = firstWord.charAt(0).toUpperCase() + firstWord.slice(1)
    }
  }

  return {
    buyerId,
    buyerName,
    firstName,
    buyerLocation,
    avatarUrl,
    itemNames,
    mode,
  }
}

export async function generateMetadata({ searchParams }: DemandPageProps): Promise<Metadata> {
  const searchParamsResolved = await searchParams
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3001'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${host}`

  const data = await resolveBuyerData(searchParamsResolved)
  const primaryItemName = data.itemNames[0] || 'Fresh Produce'
  const locStr = data.buyerLocation ? ` in ${data.buyerLocation}` : ''

  let itemsSummary = primaryItemName
  if (data.itemNames.length === 2) {
    itemsSummary = `${data.itemNames[0]} & ${data.itemNames[1]}`
  } else if (data.itemNames.length > 2) {
    itemsSummary = `${data.itemNames[0]}, ${data.itemNames[1]} + ${data.itemNames.length - 2} more`
  }

  const catalogMatch = EXHAUSTIVE_US_PRODUCE.find(
    (p) => p.name.toLowerCase() === primaryItemName.toLowerCase() ||
           p.name.toLowerCase().includes(primaryItemName.toLowerCase())
  )
  const photoUrl = catalogMatch?.image
    ? catalogMatch.image.startsWith('http')
      ? catalogMatch.image
      : `${siteUrl}${catalogMatch.image}`
    : `${siteUrl}/og-share.jpg`

  const title = data.buyerName
    ? `${data.buyerName} is looking for ${itemsSummary}${locStr} | CasaGrown`
    : `Neighbors are searching for ${itemsSummary}${locStr} | CasaGrown`
  
  const description = data.buyerName
    ? `Do you have extra garden harvest? Help ${data.buyerName} by listing your produce on CasaGrown so neighbors can connect!`
    : `Do you have extra garden harvest? List your produce on CasaGrown in 30 seconds and connect with local buyers!`

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'CasaGrown Market',
      type: 'website',
      url: `${siteUrl}/demand?ref=${data.buyerId}`,
      images: [
        {
          url: photoUrl,
          width: 1200,
          height: 630,
          alt: `${itemsSummary} requested by ${data.buyerName || 'Local Neighbor'}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [photoUrl],
    },
  }
}

export default async function DemandPage({ searchParams }: DemandPageProps) {
  const searchParamsResolved = await searchParams
  const data = await resolveBuyerData(searchParamsResolved)

  const matchedItems: ProduceItem[] = data.itemNames.map((itemName, index) => {
    const catalogItem = EXHAUSTIVE_US_PRODUCE.find(
      (p) => p.name.toLowerCase() === itemName.toLowerCase() ||
             p.name.toLowerCase().includes(itemName.toLowerCase()) ||
             itemName.toLowerCase().includes(p.name.toLowerCase())
    )
    if (catalogItem) return catalogItem

    return {
      id: `demand_${index}_${itemName.toLowerCase().replace(/\s+/g, '_')}`,
      name: itemName,
      category: 'produce',
      displayCategory: 'Requested Item',
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80',
      buyersCount: 1,
      sellersCount: 0,
      unit: 'item',
    }
  })

  const displayName = data.buyerName || (data.firstName && data.firstName !== 'Buyer' && data.firstName !== 'Neighbor' ? data.firstName : 'Jane')
  const firstName = data.firstName && data.firstName !== 'Buyer' && data.firstName !== 'Neighbor' 
    ? data.firstName 
    : (displayName ? displayName.split(' ')[0] : 'Jane')

  const locStr = data.buyerLocation ? ` in ${data.buyerLocation}` : ''

  return (
    <ErrorToastProvider>
      <BootstrapProvider>
        <MarketProvider>
          <CartProvider>
            <QuickSetupProvider>
              <Navbar />
              <DemandClientView
                key={data.mode + data.buyerId}
                displayName={displayName}
                firstName={firstName}
                locStr={locStr}
                avatarUrl={data.avatarUrl}
                buyerId={data.buyerId}
                itemNames={data.itemNames}
                mode={data.mode}
                matchedItems={matchedItems}
              />
              <BottomNav />
            </QuickSetupProvider>
          </CartProvider>
        </MarketProvider>
      </BootstrapProvider>
    </ErrorToastProvider>
  )
}
