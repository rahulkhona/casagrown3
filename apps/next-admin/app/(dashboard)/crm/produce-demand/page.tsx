'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
)

type ViewMode = 'all' | 'buyers' | 'sellers' | 'overlap'

export type BuyerProduceDemand = {
  id: string
  name: string
  category: string
  displayCategory: string
  image: string
  buyersCount: number
  zipCount: number
  zipDetails: { zip: string; buyers: number; city?: string; state?: string }[]
  unit: string
}

export type SellerProduceSupply = {
  id: string
  name: string
  category: string
  displayCategory: string
  image: string
  sellersCount: number
  zipCount: number
  zipDetails: { zip: string; sellers: number; city?: string; state?: string }[]
  unit: string
}

export type ProduceZipOverlap = {
  id: string
  produceId: string
  produceName: string
  displayCategory: string
  image: string
  zip: string
  city: string
  state?: string
  buyersCount: number
  sellersCount: number
  totalActivity: number
  buyerSellerRatio: number
  marketState: 'BUYER_DEFICIT' | 'BALANCED' | 'SELLER_SURPLUS'
  unit: string
}

// Produce Image & Category helper
const PRODUCE_CATALOG_MAP: Record<string, { displayCategory: string; image: string; unit: string }> = {
  'heirloom tomatoes': { displayCategory: 'Vegetables', image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80', unit: 'lb' },
  'tomatoes': { displayCategory: 'Vegetables', image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80', unit: 'lb' },
  'cherry tomatoes': { displayCategory: 'Vegetables', image: 'https://images.unsplash.com/photo-1546470427-e26264be0b11?auto=format&fit=crop&w=400&q=80', unit: 'pint' },
  'meyer lemons': { displayCategory: 'Citrus', image: 'https://images.unsplash.com/photo-1534531141738-9e530663737a?auto=format&fit=crop&w=400&q=80', unit: 'lb' },
  'lemons': { displayCategory: 'Citrus', image: 'https://images.unsplash.com/photo-1534531141738-9e530663737a?auto=format&fit=crop&w=400&q=80', unit: 'lb' },
  'valencia oranges': { displayCategory: 'Citrus', image: 'https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=400&q=80', unit: 'bag' },
  'oranges': { displayCategory: 'Citrus', image: 'https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=400&q=80', unit: 'bag' },
  'mandarins': { displayCategory: 'Citrus', image: 'https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=400&q=80', unit: 'bag' },
  'satsuma mandarins': { displayCategory: 'Citrus', image: 'https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=400&q=80', unit: 'bag' },
  'persian limes': { displayCategory: 'Citrus', image: 'https://images.unsplash.com/photo-1590502160462-0e95ee2698e8?auto=format&fit=crop&w=400&q=80', unit: 'lb' },
  'limes': { displayCategory: 'Citrus', image: 'https://images.unsplash.com/photo-1590502160462-0e95ee2698e8?auto=format&fit=crop&w=400&q=80', unit: 'lb' },
  'hass avocados': { displayCategory: 'Fruit', image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=400&q=80', unit: 'bag' },
  'avocados': { displayCategory: 'Fruit', image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=400&q=80', unit: 'bag' },
  'figs': { displayCategory: 'Fruit', image: 'https://images.unsplash.com/photo-1601379327928-bedfaf9da2d0?auto=format&fit=crop&w=400&q=80', unit: 'lb' },
  'mission & kadota figs': { displayCategory: 'Fruit', image: 'https://images.unsplash.com/photo-1601379327928-bedfaf9da2d0?auto=format&fit=crop&w=400&q=80', unit: 'lb' },
  'sweet corn': { displayCategory: 'Vegetables', image: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=400&q=80', unit: 'dozen' },
  'corn': { displayCategory: 'Vegetables', image: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=400&q=80', unit: 'dozen' },
  'basil': { displayCategory: 'Herbs', image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80', unit: 'bunch' },
  'fresh sweet basil': { displayCategory: 'Herbs', image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80', unit: 'bunch' },
  'pasture-raised eggs': { displayCategory: 'Eggs & Dairy', image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=400&q=80', unit: 'dozen' },
  'eggs': { displayCategory: 'Eggs & Dairy', image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=400&q=80', unit: 'dozen' },
  'honey': { displayCategory: 'Honey', image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=400&q=80', unit: 'jar' },
  'wildflower honey': { displayCategory: 'Honey', image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=400&q=80', unit: 'jar' },
}

function resolveProduceMeta(produceName: string) {
  const norm = produceName.trim().toLowerCase()
  if (PRODUCE_CATALOG_MAP[norm]) return PRODUCE_CATALOG_MAP[norm]

  for (const [k, v] of Object.entries(PRODUCE_CATALOG_MAP)) {
    if (norm.includes(k) || k.includes(norm)) return v
  }

  return {
    displayCategory: 'Vegetables',
    image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=400&q=80',
    unit: 'item',
  }
}

type BuyerSortKey = 'name' | 'displayCategory' | 'buyersCount' | 'zipCount'
type SellerSortKey = 'name' | 'displayCategory' | 'sellersCount' | 'zipCount'
type OverlapSortKey = 'produceName' | 'zip' | 'buyersCount' | 'sellersCount' | 'totalActivity' | 'buyerSellerRatio'
type SortDirection = 'asc' | 'desc'

export default function ProduceDemandPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [buyerDemands, setBuyerDemands] = useState<BuyerProduceDemand[]>([])
  const [sellerSupplies, setSellerSupplies] = useState<SellerProduceSupply[]>([])
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [minCountFilter, setMinCountFilter] = useState<number>(0)
  const [toastMessage, setToastMessage] = useState('')

  // Sort states for all 3 tables
  const [buyerSort, setBuyerSort] = useState<{ key: BuyerSortKey; dir: SortDirection }>({
    key: 'buyersCount',
    dir: 'desc',
  })
  const [sellerSort, setSellerSort] = useState<{ key: SellerSortKey; dir: SortDirection }>({
    key: 'sellersCount',
    dir: 'desc',
  })
  const [overlapSort, setOverlapSort] = useState<{ key: OverlapSortKey; dir: SortDirection }>({
    key: 'buyersCount',
    dir: 'desc',
  })

  const toast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 4000)
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text)
    toast(`Copied ${label} (${text}) to clipboard!`)
  }

  // ── LIVE DATABASE FETCH ──────────────────────────────────────────
  const fetchDemandAndSupplyData = useCallback(async () => {
    setLoading(true)
    setDbError(null)

    try {
      // 1. Fetch CRM Produce Interests
      const { data: crmInterests } = await supabase
        .from('crm_produce_interests')
        .select('produce_name, interest_type, zipcodes, lead_id, user_id, status')
        .eq('status', 'active')

      // 2. Fetch CRM Leads with produce interests
      const { data: crmLeads } = await supabase
        .from('crm_leads')
        .select('id, produce_interests, zipcode, form_version, metadata')
        .not('produce_interests', 'is', null)

      // 3. Fetch Onboarding produce_interests
      const { data: onboardingInterests } = await supabase
        .from('produce_interests')
        .select('produce_name, user_id')

      // 4. Fetch Profiles for ZIP codes
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, zip_code, city, state')

      // 5. Fetch Market Products (real seller listings)
      const { data: marketProducts } = await supabase
        .from('market_products')
        .select('name, category, seller_id')
        .eq('is_active', true)

      // 6. Fetch Market Booths for seller ZIPs
      const { data: marketBooths } = await supabase
        .from('market_booths')
        .select('seller_id, booth_zip, pickup_zip, city, state')
        .eq('status', 'active')

      const profileMap = new Map<string, { zip: string; city: string; state: string }>()
      if (profiles) {
        for (const p of profiles) {
          if (p.zip_code) {
            profileMap.set(p.id, { zip: p.zip_code, city: p.city || '', state: p.state || '' })
          }
        }
      }

      const boothMap = new Map<string, { zip: string; city: string; state: string }>()
      if (marketBooths) {
        for (const b of marketBooths) {
          const zip = b.booth_zip || b.pickup_zip
          if (zip) {
            boothMap.set(b.seller_id, { zip, city: b.city || '', state: b.state || '' })
          }
        }
      }

      // ── Process Buyer Demand ─────────────────────────────────────
      // Map: produce_name -> Map: zip -> { buyers: Set<buyer_id>, city, state }
      const buyerMap = new Map<string, Map<string, { buyers: Set<string>; city?: string; state?: string }>>()

      const recordBuyerInterest = (produce: string, zip: string, buyerId: string, city?: string, state?: string) => {
        const prodKey = produce.trim().toLowerCase()
        const cleanZip = zip.trim()
        if (!prodKey || !cleanZip) return

        if (!buyerMap.has(prodKey)) {
          buyerMap.set(prodKey, new Map())
        }
        const zipMap = buyerMap.get(prodKey)!
        if (!zipMap.has(cleanZip)) {
          zipMap.set(cleanZip, { buyers: new Set(), city, state })
        }
        zipMap.get(cleanZip)!.buyers.add(buyerId)
      }

      // Add crm_produce_interests (buy)
      if (crmInterests) {
        for (const ci of crmInterests) {
          if (ci.interest_type === 'buy' && ci.produce_name) {
            const buyerId = ci.user_id || ci.lead_id || 'anon'
            const profile = ci.user_id ? profileMap.get(ci.user_id) : undefined
            const zips: string[] = ci.zipcodes && Array.isArray(ci.zipcodes) && ci.zipcodes.length > 0
              ? ci.zipcodes
              : profile?.zip ? [profile.zip] : []

            for (const z of zips) {
              recordBuyerInterest(ci.produce_name, z, buyerId, profile?.city, profile?.state)
            }
          }
        }
      }
      // Add crm_leads ONLY if they are explicitly buyer forms (e.g. nutrition estimator or metadata.interest_type = 'buy')
      if (crmLeads) {
        for (const l of crmLeads) {
          const isExplicitBuyer = 
            l.form_version === 'v1-nutrition-estimator' || 
            (l.metadata && typeof l.metadata === 'object' && (l.metadata as any).interest_type === 'buy')

          if (isExplicitBuyer && l.produce_interests && l.zipcode) {
            const items = l.produce_interests.split(',').map((s: string) => s.trim()).filter(Boolean)
            for (const item of items) {
              recordBuyerInterest(item, l.zipcode, l.id)
            }
          }
        }
      }

      // Add onboarding produce_interests (strictly buyers)
      if (onboardingInterests) {
        for (const oi of onboardingInterests) {
          if (oi.produce_name && oi.user_id) {
            const prof = profileMap.get(oi.user_id)
            if (prof && prof.zip) {
              recordBuyerInterest(oi.produce_name, prof.zip, oi.user_id, prof.city, prof.state)
            }
          }
        }
      }

      // ── Process Seller Supply ────────────────────────────────────
      const sellerMap = new Map<string, Map<string, { sellers: Set<string>; city?: string; state?: string }>>()

      const recordSellerSupply = (produce: string, zip: string, sellerId: string, city?: string, state?: string) => {
        const prodKey = produce.trim().toLowerCase()
        const cleanZip = zip.trim()
        if (!prodKey || !cleanZip) return

        if (!sellerMap.has(prodKey)) {
          sellerMap.set(prodKey, new Map())
        }
        const zipMap = sellerMap.get(prodKey)!
        if (!zipMap.has(cleanZip)) {
          zipMap.set(cleanZip, { sellers: new Set(), city, state })
        }
        zipMap.get(cleanZip)!.sellers.add(sellerId)
      }

      // Add crm_produce_interests (sell)
      if (crmInterests) {
        for (const ci of crmInterests) {
          if (ci.interest_type === 'sell' && ci.produce_name) {
            const sellerId = ci.user_id || ci.lead_id || 'anon'
            const profile = ci.user_id ? profileMap.get(ci.user_id) : undefined
            const zips: string[] = ci.zipcodes && Array.isArray(ci.zipcodes) && ci.zipcodes.length > 0
              ? ci.zipcodes
              : profile?.zip ? [profile.zip] : []

            for (const z of zips) {
              recordSellerSupply(ci.produce_name, z, sellerId, profile?.city, profile?.state)
            }
          }
        }
      }

      // Add real market_products listings
      if (marketProducts) {
        for (const mp of marketProducts) {
          if (mp.name && mp.seller_id) {
            const booth = boothMap.get(mp.seller_id) || profileMap.get(mp.seller_id)
            if (booth && booth.zip) {
              recordSellerSupply(mp.name, booth.zip, mp.seller_id, booth.city, booth.state)
            }
          }
        }
      }

      // ── Format Buyer Produce Demand list ─────────────────────────
      const buyersList: BuyerProduceDemand[] = []
      for (const [prodName, zMap] of buyerMap.entries()) {
        const allBuyers = new Set<string>()
        const zipDetails: { zip: string; buyers: number; city?: string; state?: string }[] = []

        for (const [z, info] of zMap.entries()) {
          for (const b of info.buyers) allBuyers.add(b)
          zipDetails.push({
            zip: z,
            buyers: info.buyers.size,
            city: info.city,
            state: info.state,
          })
        }

        zipDetails.sort((a, b) => b.buyers - a.buyers)
        const meta = resolveProduceMeta(prodName)

        buyersList.push({
          id: prodName.replace(/\s+/g, '_'),
          name: prodName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          category: meta.displayCategory.toLowerCase(),
          displayCategory: meta.displayCategory,
          image: meta.image,
          buyersCount: allBuyers.size,
          zipCount: zipDetails.length,
          zipDetails,
          unit: meta.unit,
        })
      }

      buyersList.sort((a, b) => b.buyersCount - a.buyersCount)
      setBuyerDemands(buyersList)

      // ── Format Seller Produce Supply list ────────────────────────
      const sellersList: SellerProduceSupply[] = []
      for (const [prodName, zMap] of sellerMap.entries()) {
        const allSellers = new Set<string>()
        const zipDetails: { zip: string; sellers: number; city?: string; state?: string }[] = []

        for (const [z, info] of zMap.entries()) {
          for (const s of info.sellers) allSellers.add(s)
          zipDetails.push({
            zip: z,
            sellers: info.sellers.size,
            city: info.city,
            state: info.state,
          })
        }

        zipDetails.sort((a, b) => b.sellers - a.sellers)
        const meta = resolveProduceMeta(prodName)

        sellersList.push({
          id: prodName.replace(/\s+/g, '_'),
          name: prodName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          category: meta.displayCategory.toLowerCase(),
          displayCategory: meta.displayCategory,
          image: meta.image,
          sellersCount: allSellers.size,
          zipCount: zipDetails.length,
          zipDetails,
          unit: meta.unit,
        })
      }

      sellersList.sort((a, b) => b.sellersCount - a.sellersCount)
      setSellerSupplies(sellersList)

    } catch (err: any) {
      console.error('[ProduceDemandPage] Error fetching live demand/supply:', err)
      setDbError(err?.message || 'Failed to query database')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDemandAndSupplyData()
  }, [fetchDemandAndSupplyData])

  // Generate Overlap Matrix (Table c) where BOTH genuine buyers > 0 and sellers > 0 in the same zipcode
  const overlapList = useMemo(() => {
    const overlaps: ProduceZipOverlap[] = []
    const sellerIndex = new Map<string, Map<string, { count: number; city?: string; state?: string }>>()

    for (const s of sellerSupplies) {
      const zMap = new Map<string, { count: number; city?: string; state?: string }>()
      for (const z of s.zipDetails) {
        zMap.set(z.zip, { count: z.sellers, city: z.city, state: z.state })
      }
      sellerIndex.set(s.id, zMap)
    }

    for (const b of buyerDemands) {
      const sZMap = sellerIndex.get(b.id)
      if (!sZMap) continue

      for (const bz of b.zipDetails) {
        const sItem = sZMap.get(bz.zip)
        if (sItem && sItem.count > 0 && bz.buyers > 0) {
          const ratio = parseFloat((bz.buyers / sItem.count).toFixed(2))
          let state: 'BUYER_DEFICIT' | 'BALANCED' | 'SELLER_SURPLUS' = 'BALANCED'
          if (ratio >= 2.0) state = 'BUYER_DEFICIT'
          else if (ratio <= 0.7) state = 'SELLER_SURPLUS'

          overlaps.push({
            id: `${b.id}_${bz.zip}`,
            produceId: b.id,
            produceName: b.name,
            displayCategory: b.displayCategory,
            image: b.image,
            zip: bz.zip,
            city: bz.city || sItem.city || 'Local Area',
            state: bz.state || sItem.state,
            buyersCount: bz.buyers,
            sellersCount: sItem.count,
            totalActivity: bz.buyers + sItem.count,
            buyerSellerRatio: ratio,
            marketState: state,
            unit: b.unit,
          })
        }
      }
    }

    return overlaps
  }, [buyerDemands, sellerSupplies])

  // Filtered & Sorted Table (a): Buyer Demand
  const filteredBuyerDemands = useMemo(() => {
    return buyerDemands
      .filter(item => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.displayCategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.zipDetails.some(
            z =>
              z.zip.includes(searchQuery.trim()) ||
              (z.city && z.city.toLowerCase().includes(searchQuery.toLowerCase())) ||
              (z.state && z.state.toLowerCase().includes(searchQuery.toLowerCase()))
          )

        const matchesCat = categoryFilter === 'ALL' || item.displayCategory.toUpperCase() === categoryFilter.toUpperCase()
        const matchesCount = minCountFilter === 0 || item.buyersCount >= minCountFilter

        return matchesSearch && matchesCat && matchesCount
      })
      .sort((a, b) => {
        let valA = a[buyerSort.key]
        let valB = b[buyerSort.key]
        if (typeof valA === 'string') {
          return buyerSort.dir === 'asc' ? (valA as string).localeCompare(valB as string) : (valB as string).localeCompare(valA as string)
        }
        return buyerSort.dir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
      })
  }, [buyerDemands, searchQuery, categoryFilter, minCountFilter, buyerSort])

  // Filtered & Sorted Table (b): Seller Supply
  const filteredSellerSupplies = useMemo(() => {
    return sellerSupplies
      .filter(item => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.displayCategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.zipDetails.some(
            z =>
              z.zip.includes(searchQuery.trim()) ||
              (z.city && z.city.toLowerCase().includes(searchQuery.toLowerCase())) ||
              (z.state && z.state.toLowerCase().includes(searchQuery.toLowerCase()))
          )

        const matchesCat = categoryFilter === 'ALL' || item.displayCategory.toUpperCase() === categoryFilter.toUpperCase()
        const matchesCount = minCountFilter === 0 || item.sellersCount >= minCountFilter

        return matchesSearch && matchesCat && matchesCount
      })
      .sort((a, b) => {
        let valA = a[sellerSort.key]
        let valB = b[sellerSort.key]
        if (typeof valA === 'string') {
          return sellerSort.dir === 'asc' ? (valA as string).localeCompare(valB as string) : (valB as string).localeCompare(valA as string)
        }
        return sellerSort.dir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
      })
  }, [sellerSupplies, searchQuery, categoryFilter, minCountFilter, sellerSort])

  // Filtered & Sorted Table (c): Overlap Pairs
  const filteredOverlaps = useMemo(() => {
    return overlapList
      .filter(item => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          item.produceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.displayCategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.zip.includes(searchQuery.trim()) ||
          item.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.state && item.state.toLowerCase().includes(searchQuery.toLowerCase()))

        const matchesCat = categoryFilter === 'ALL' || item.displayCategory.toUpperCase() === categoryFilter.toUpperCase()
        const matchesCount = minCountFilter === 0 || (item.buyersCount >= minCountFilter || item.sellersCount >= minCountFilter)

        return matchesSearch && matchesCat && matchesCount
      })
      .sort((a, b) => {
        let valA = a[overlapSort.key]
        let valB = b[overlapSort.key]
        if (typeof valA === 'string') {
          return overlapSort.dir === 'asc' ? (valA as string).localeCompare(valB as string) : (valB as string).localeCompare(valA as string)
        }
        return overlapSort.dir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
      })
  }, [overlapList, searchQuery, categoryFilter, minCountFilter, overlapSort])

  // Aggregate Stats
  const totalBuyers = useMemo(() => buyerDemands.reduce((acc, i) => acc + i.buyersCount, 0), [buyerDemands])
  const totalSellers = useMemo(() => sellerSupplies.reduce((acc, i) => acc + i.sellersCount, 0), [sellerSupplies])
  const uniqueDemandZips = useMemo(() => new Set(buyerDemands.flatMap(i => i.zipDetails.map(z => z.zip))).size, [buyerDemands])
  const uniqueSupplyZips = useMemo(() => new Set(sellerSupplies.flatMap(i => i.zipDetails.map(z => z.zip))).size, [sellerSupplies])

  return (
    <div className="crm-page">
      {/* ── Header ── */}
      <div className="radar-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="crm-title">Produce Demand &amp; Supply Intelligence Radar</h1>
            <p className="crm-subtitle">
              Live database queries across all buyer interests, CRM leads, and seller listings per ZIP code nationwide.
            </p>
          </div>
          <button className="btn-refresh" onClick={fetchDemandAndSupplyData} disabled={loading}>
            {loading ? 'Refreshing…' : '🔄 Refresh Live Data'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="crm-toast success">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage('')} className="toast-close">✕</button>
        </div>
      )}

      {dbError && (
        <div className="crm-toast error">
          <span>Database query note: {dbError}</span>
          <button onClick={() => setDbError(null)} className="toast-close">✕</button>
        </div>
      )}

      {/* ── KPI Summary Cards ── */}
      <div className="kpi-grid">
        <div className="kpi-card buyer-kpi">
          <div className="kpi-label">Total Buyer Demand</div>
          <div className="kpi-value">{loading ? '…' : `${totalBuyers} Buyers`}</div>
          <div className="kpi-sub">Across {uniqueDemandZips} distinct ZIP codes</div>
        </div>
        <div className="kpi-card seller-kpi">
          <div className="kpi-label">Total Seller Supply</div>
          <div className="kpi-value">{loading ? '…' : `${totalSellers} Sellers`}</div>
          <div className="kpi-sub">Across {uniqueSupplyZips} distinct ZIP codes</div>
        </div>
        <div className="kpi-card overlap-kpi">
          <div className="kpi-label">Matched Produce-ZIP Pairs</div>
          <div className="kpi-value">{loading ? '…' : `${overlapList.length} Liquid Markets`}</div>
          <div className="kpi-sub">Both buyers &amp; sellers present in same ZIP</div>
        </div>
        <div className="kpi-card top-kpi">
          <div className="kpi-label">Top Demand Leader</div>
          <div className="kpi-value">{loading ? '…' : (buyerDemands[0]?.name || 'None Recorded')}</div>
          <div className="kpi-sub">
            {buyerDemands[0] ? `${buyerDemands[0].buyersCount} buyers in ${buyerDemands[0].zipCount} ZIPs` : 'No active demand'}
          </div>
        </div>
      </div>

      {/* ── Filter Bar & View Mode Toggle ── */}
      <div className="radar-controls-bar">
        {/* View Mode Buttons */}
        <div className="view-mode-group">
          <button
            className={`mode-btn ${viewMode === 'all' ? 'active' : ''}`}
            onClick={() => setViewMode('all')}
          >
            📋 All 3 Tables
          </button>
          <button
            className={`mode-btn ${viewMode === 'buyers' ? 'active' : ''}`}
            onClick={() => setViewMode('buyers')}
          >
            🛒 (a) Buyer Demand ({filteredBuyerDemands.length})
          </button>
          <button
            className={`mode-btn ${viewMode === 'sellers' ? 'active' : ''}`}
            onClick={() => setViewMode('sellers')}
          >
            🌾 (b) Seller Supply ({filteredSellerSupplies.length})
          </button>
          <button
            className={`mode-btn ${viewMode === 'overlap' ? 'active' : ''}`}
            onClick={() => setViewMode('overlap')}
          >
            ⚡ (c) Matched by ZIP ({filteredOverlaps.length})
          </button>
        </div>

        {/* Search & Category Filters */}
        <div className="search-filter-group">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search produce name, category, city, or ZIP (e.g. 75001, Meyer Lemons)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button className="clear-btn" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>

          <select
            className="filter-select"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            <option value="CITRUS">Citrus</option>
            <option value="VEGETABLES">Vegetables</option>
            <option value="FRUIT">Fruit</option>
            <option value="HERBS">Herbs</option>
            <option value="EGGS & DAIRY">Eggs &amp; Dairy</option>
            <option value="HONEY">Honey</option>
          </select>

          <select
            className="filter-select"
            value={minCountFilter}
            onChange={e => setMinCountFilter(parseInt(e.target.value))}
          >
            <option value={0}>Min Count: Any</option>
            <option value={5}>5+ People</option>
            <option value={10}>10+ People</option>
            <option value={20}>20+ People</option>
            <option value={40}>40+ People</option>
          </select>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TABLE (a): BUYER DEMAND TABLE                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {(viewMode === 'all' || viewMode === 'buyers') && (
        <div className="section-card">
          <div className="section-header">
            <div>
              <h2 className="section-title">🛒 Table (a) — Buyer Demand (Ranked by Active Buyers)</h2>
              <p className="section-desc">
                Shows all produce items where buyers are actively searching across live database records.
              </p>
            </div>
            <span className="sort-hint">Click column headers to sort</span>
          </div>

          <div className="crm-table-wrap">
            <table id="buyer-demand-table" className="crm-table sortable-table">
              <thead>
                <tr>
                  <th
                    style={{ width: '25%' }}
                    onClick={() => setBuyerSort(s => ({ key: 'name', dir: s.key === 'name' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Produce Name {buyerSort.key === 'name' ? (buyerSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '14%' }}
                    onClick={() => setBuyerSort(s => ({ key: 'displayCategory', dir: s.key === 'displayCategory' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Category {buyerSort.key === 'displayCategory' ? (buyerSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '16%' }}
                    onClick={() => setBuyerSort(s => ({ key: 'buyersCount', dir: s.key === 'buyersCount' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Number of Buyers {buyerSort.key === 'buyersCount' ? (buyerSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '15%' }}
                    onClick={() => setBuyerSort(s => ({ key: 'zipCount', dir: s.key === 'zipCount' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Number of ZIPs {buyerSort.key === 'zipCount' ? (buyerSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th style={{ width: '30%' }}>List of Demand ZIP Codes &amp; Density</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="empty-td">Loading live database records…</td>
                  </tr>
                ) : filteredBuyerDemands.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-td">No buyer demand found matching filter.</td>
                  </tr>
                ) : (
                  filteredBuyerDemands.map(item => {
                    const zipListStr = item.zipDetails.map(z => z.zip).join(', ')
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <img src={item.image} alt={item.name} className="produce-thumb" />
                            <div>
                              <strong style={{ display: 'block', color: '#111827', fontSize: '0.95rem' }}>
                                {item.name}
                              </strong>
                              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Sales unit: {item.unit}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`cat-badge ${item.displayCategory.toLowerCase()}`}>
                            {item.displayCategory}
                          </span>
                        </td>
                        <td>
                          <div className="count-cell buyer-color">
                            <span className="count-num">{item.buyersCount}</span>
                            <span className="count-sub">active buyers</span>
                          </div>
                        </td>
                        <td>
                          <span className="zip-count-pill">{item.zipCount} ZIP codes</span>
                        </td>
                        <td>
                          <div className="zip-pills-wrap">
                            {item.zipDetails.map(z => (
                              <span key={z.zip} className="zip-pill" title={`${z.buyers} buyers in ${z.zip} ${z.city ? `(${z.city}, ${z.state || ''})` : ''}`}>
                                <strong>{z.zip}</strong>
                                <span className="zip-pill-sub">({z.buyers})</span>
                              </span>
                            ))}
                            <button
                              className="btn-copy-zips"
                              onClick={() => copyToClipboard(zipListStr, `ZIPs for ${item.name}`)}
                              title="Copy all ZIPs to clipboard for Meta Ads Manager"
                            >
                              📋 Copy ZIPs
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TABLE (b): SELLER SUPPLY TABLE                                  */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {(viewMode === 'all' || viewMode === 'sellers') && (
        <div className="section-card">
          <div className="section-header">
            <div>
              <h2 className="section-title">🌾 Table (b) — Seller Supply / Listings (Ranked by Active Sellers)</h2>
              <p className="section-desc">
                Shows all produce items where local growers have listings or declared growing availability.
              </p>
            </div>
            <span className="sort-hint">Click column headers to sort</span>
          </div>

          <div className="crm-table-wrap">
            <table id="seller-supply-table" className="crm-table sortable-table">
              <thead>
                <tr>
                  <th
                    style={{ width: '25%' }}
                    onClick={() => setSellerSort(s => ({ key: 'name', dir: s.key === 'name' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Produce Name {sellerSort.key === 'name' ? (sellerSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '14%' }}
                    onClick={() => setSellerSort(s => ({ key: 'displayCategory', dir: s.key === 'displayCategory' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Category {sellerSort.key === 'displayCategory' ? (sellerSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '16%' }}
                    onClick={() => setSellerSort(s => ({ key: 'sellersCount', dir: s.key === 'sellersCount' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Number of Sellers {sellerSort.key === 'sellersCount' ? (sellerSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '15%' }}
                    onClick={() => setSellerSort(s => ({ key: 'zipCount', dir: s.key === 'zipCount' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Number of ZIPs {sellerSort.key === 'zipCount' ? (sellerSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th style={{ width: '30%' }}>List of Supply ZIP Codes &amp; Density</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="empty-td">Loading live database records…</td>
                  </tr>
                ) : filteredSellerSupplies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-td">No seller supply found matching filter.</td>
                  </tr>
                ) : (
                  filteredSellerSupplies.map(item => {
                    const zipListStr = item.zipDetails.map(z => z.zip).join(', ')
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <img src={item.image} alt={item.name} className="produce-thumb" />
                            <div>
                              <strong style={{ display: 'block', color: '#111827', fontSize: '0.95rem' }}>
                                {item.name}
                              </strong>
                              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Sales unit: {item.unit}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`cat-badge ${item.displayCategory.toLowerCase()}`}>
                            {item.displayCategory}
                          </span>
                        </td>
                        <td>
                          <div className="count-cell seller-color">
                            <span className="count-num">{item.sellersCount}</span>
                            <span className="count-sub">active growers/sellers</span>
                          </div>
                        </td>
                        <td>
                          <span className="zip-count-pill">{item.zipCount} ZIP codes</span>
                        </td>
                        <td>
                          <div className="zip-pills-wrap">
                            {item.zipDetails.map(z => (
                              <span key={z.zip} className="zip-pill seller-pill" title={`${z.sellers} sellers in ${z.zip} ${z.city ? `(${z.city}, ${z.state || ''})` : ''}`}>
                                <strong>{z.zip}</strong>
                                <span className="zip-pill-sub">({z.sellers})</span>
                              </span>
                            ))}
                            <button
                              className="btn-copy-zips"
                              onClick={() => copyToClipboard(zipListStr, `Seller ZIPs for ${item.name}`)}
                              title="Copy all ZIPs to clipboard"
                            >
                              📋 Copy ZIPs
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TABLE (c): MATCHED PRODUCE & ZIP OVERLAP (BOTH BUY & SELL)       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {(viewMode === 'all' || viewMode === 'overlap') && (
        <div className="section-card highlight-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">⚡ Table (c) — Matched Liquidity (Both Buy &amp; Sell Interest in Same ZIP)</h2>
              <p className="section-desc">
                High-priority ad targets: specific ZIP codes where both buyers want produce AND local sellers exist.
              </p>
            </div>
            <span className="sort-hint">Click column headers to sort</span>
          </div>

          <div className="crm-table-wrap">
            <table id="overlap-matches-table" className="crm-table sortable-table">
              <thead>
                <tr>
                  <th
                    style={{ width: '22%' }}
                    onClick={() => setOverlapSort(s => ({ key: 'produceName', dir: s.key === 'produceName' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Produce Item {overlapSort.key === 'produceName' ? (overlapSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '20%' }}
                    onClick={() => setOverlapSort(s => ({ key: 'zip', dir: s.key === 'zip' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    ZIP Code &amp; Area {overlapSort.key === 'zip' ? (overlapSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '14%' }}
                    onClick={() => setOverlapSort(s => ({ key: 'buyersCount', dir: s.key === 'buyersCount' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Buyers in ZIP {overlapSort.key === 'buyersCount' ? (overlapSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '14%' }}
                    onClick={() => setOverlapSort(s => ({ key: 'sellersCount', dir: s.key === 'sellersCount' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Sellers in ZIP {overlapSort.key === 'sellersCount' ? (overlapSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '14%' }}
                    onClick={() => setOverlapSort(s => ({ key: 'totalActivity', dir: s.key === 'totalActivity' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Total Activity {overlapSort.key === 'totalActivity' ? (overlapSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '16%' }}
                    onClick={() => setOverlapSort(s => ({ key: 'buyerSellerRatio', dir: s.key === 'buyerSellerRatio' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Market State {overlapSort.key === 'buyerSellerRatio' ? (overlapSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="empty-td">Loading live database records…</td>
                  </tr>
                ) : filteredOverlaps.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-td">No matched produce/zipcode pairs found matching filter.</td>
                  </tr>
                ) : (
                  filteredOverlaps.map(item => (
                    <tr key={item.id} className={item.marketState === 'BUYER_DEFICIT' ? 'high-demand-row' : ''}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <img src={item.image} alt={item.produceName} className="produce-thumb" />
                          <div>
                            <strong style={{ display: 'block', color: '#111827' }}>{item.produceName}</strong>
                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{item.displayCategory}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div>
                          <span className="zip-code-strong">{item.zip}</span>
                          <span className="city-sub">{item.city}{item.state ? `, ${item.state}` : ''}</span>
                        </div>
                      </td>
                      <td>
                        <div className="count-cell buyer-color">
                          <span className="count-num">{item.buyersCount}</span>
                          <span className="count-sub">buyers</span>
                        </div>
                      </td>
                      <td>
                        <div className="count-cell seller-color">
                          <span className="count-num">{item.sellersCount}</span>
                          <span className="count-sub">sellers</span>
                        </div>
                      </td>
                      <td>
                        <strong style={{ fontSize: '1rem', color: '#111827' }}>
                          {item.totalActivity} total
                        </strong>
                      </td>
                      <td>
                        <div className="market-state-cell">
                          {item.marketState === 'BUYER_DEFICIT' ? (
                            <span className="state-badge deficit" title="High buyer demand with limited sellers — top candidate for seller acquisition ads!">
                              🔥 {item.buyerSellerRatio}x Buyer Deficit
                            </span>
                          ) : item.marketState === 'SELLER_SURPLUS' ? (
                            <span className="state-badge surplus" title="More sellers than buyers — candidate for buyer discount promos">
                              🌾 {item.buyerSellerRatio}x Seller Surplus
                            </span>
                          ) : (
                            <span className="state-badge balanced" title="Healthy balanced marketplace liquidity">
                              ⚖️ Balanced ({item.buyerSellerRatio}x)
                            </span>
                          )}
                          <button
                            className="btn-quick-copy"
                            onClick={() => copyToClipboard(item.zip, `ZIP ${item.zip} for ${item.produceName}`)}
                          >
                            📋 Copy ZIP {item.zip}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STYLES ── */}
      <style jsx>{`
        .crm-page {
          padding: 24px;
          max-width: 1360px;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #1f2937;
        }

        .radar-header {
          margin-bottom: 24px;
        }

        .crm-title {
          font-size: 1.8rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 6px;
        }

        .crm-subtitle {
          font-size: 0.95rem;
          color: #6b7280;
          margin: 0;
          max-width: 900px;
          line-height: 1.4;
        }

        .btn-refresh {
          background: #ffffff;
          border: 1px solid #d1d5db;
          color: #374151;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 8px 14px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-refresh:hover:not(:disabled) {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .btn-refresh:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Toast */
        .crm-toast {
          display: flex;
          align-items: center;
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 0.9rem;
        }

        .crm-toast.error {
          background: #fef2f2;
          color: #991b1b;
          border-color: #fecaca;
        }

        .toast-close {
          background: none;
          border: none;
          font-size: 1rem;
          cursor: pointer;
          color: inherit;
          margin-left: 12px;
        }

        /* KPI Cards */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .kpi-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          padding: 18px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .buyer-kpi { border-left: 4px solid #16a34a; }
        .seller-kpi { border-left: 4px solid #2563eb; }
        .overlap-kpi { border-left: 4px solid #f59e0b; }
        .top-kpi { border-left: 4px solid #9333ea; }

        .kpi-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
        }

        .kpi-value {
          font-size: 1.6rem;
          font-weight: 700;
          color: #111827;
          margin: 4px 0;
        }

        .kpi-sub {
          font-size: 0.8rem;
          color: #6b7280;
        }

        /* Controls Bar */
        .radar-controls-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .view-mode-group {
          display: flex;
          background: #f3f4f6;
          padding: 4px;
          border-radius: 10px;
          gap: 4px;
          overflow-x: auto;
        }

        .mode-btn {
          border: none;
          background: none;
          padding: 8px 16px;
          font-size: 0.85rem;
          font-weight: 600;
          color: #4b5563;
          border-radius: 8px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
        }

        .mode-btn:hover {
          color: #111827;
        }

        .mode-btn.active {
          background: #ffffff;
          color: #16a34a;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .search-filter-group {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          flex: 1;
          justify-content: flex-end;
          min-width: 320px;
        }

        .search-input-wrap {
          position: relative;
          min-width: 280px;
          flex: 1;
          max-width: 440px;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
          font-size: 0.85rem;
        }

        .search-input {
          width: 100%;
          padding: 9px 34px 9px 34px;
          font-size: 0.88rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #ffffff;
        }

        .clear-btn {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
        }

        .filter-select {
          padding: 9px 12px;
          font-size: 0.85rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #ffffff;
          color: #374151;
        }

        /* Section Card */
        .section-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 28px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .section-card.highlight-section {
          border: 2px solid #fed7aa;
          background: #fffbf5;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .section-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 4px;
        }

        .section-desc {
          font-size: 0.85rem;
          color: #6b7280;
          margin: 0;
        }

        .sort-hint {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        /* Table */
        .crm-table-wrap {
          overflow-x: auto;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #ffffff;
        }

        .crm-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.88rem;
        }

        .crm-table th {
          background: #f9fafb;
          padding: 12px 16px;
          font-size: 0.8rem;
          font-weight: 600;
          color: #4b5563;
          text-transform: uppercase;
          border-bottom: 1px solid #e5e7eb;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          transition: background 0.15s;
        }

        .crm-table th:hover {
          background: #f3f4f6;
          color: #111827;
        }

        .crm-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #f3f4f6;
          vertical-align: middle;
        }

        .crm-table tr:last-child td {
          border-bottom: none;
        }

        .empty-td {
          text-align: center;
          padding: 36px 0;
          color: #9ca3af;
        }

        .high-demand-row {
          background: #fffaf0;
        }

        /* Produce Thumbnail & Badges */
        .produce-thumb {
          width: 42px;
          height: 42px;
          border-radius: 8px;
          object-fit: cover;
          border: 1px solid #e5e7eb;
        }

        .cat-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 6px;
          background: #f3f4f6;
          color: #4b5563;
        }

        .cat-badge.citrus { background: #fef3c7; color: #b45309; }
        .cat-badge.vegetables { background: #dcfce7; color: #15803d; }
        .cat-badge.fruit { background: #fee2e2; color: #b91c1c; }
        .cat-badge.herbs { background: #ecfdf5; color: #047857; }
        .cat-badge.eggs { background: #fef9c3; color: #a16207; }
        .cat-badge.honey { background: #ffedd5; color: #c2410c; }

        .count-cell {
          display: flex;
          flex-direction: column;
        }

        .count-num {
          font-size: 1.15rem;
          font-weight: 700;
        }

        .count-sub {
          font-size: 0.7rem;
          color: #6b7280;
        }

        .buyer-color .count-num { color: #15803d; }
        .seller-color .count-num { color: #1d4ed8; }

        .zip-count-pill {
          display: inline-block;
          background: #f3e8ff;
          color: #6b21a8;
          font-size: 0.8rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 6px;
        }

        .zip-pills-wrap {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }

        .zip-pill {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #14532d;
          font-size: 0.75rem;
          padding: 2px 6px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }

        .zip-pill.seller-pill {
          background: #eff6ff;
          border-color: #bfdbfe;
          color: #1e3a8a;
        }

        .zip-pill-sub {
          font-weight: 700;
        }

        .btn-copy-zips {
          background: #ffffff;
          border: 1px solid #d1d5db;
          color: #374151;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .btn-copy-zips:hover {
          background: #f3f4f6;
          color: #111827;
        }

        /* Overlap table cells */
        .zip-code-strong {
          display: block;
          font-size: 0.95rem;
          font-weight: 700;
          color: #111827;
        }

        .city-sub {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .market-state-cell {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .state-badge {
          display: inline-block;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 6px;
          width: fit-content;
        }

        .state-badge.deficit {
          background: #fee2e2;
          color: #dc2626;
        }

        .state-badge.surplus {
          background: #eff6ff;
          color: #2563eb;
        }

        .state-badge.balanced {
          background: #dcfce7;
          color: #166534;
        }

        .btn-quick-copy {
          background: none;
          border: none;
          color: #6b7280;
          font-size: 0.7rem;
          cursor: pointer;
          text-align: left;
          padding: 0;
          text-decoration: underline;
        }

        .btn-quick-copy:hover {
          color: #111827;
        }
      `}</style>
    </div>
  )
}
