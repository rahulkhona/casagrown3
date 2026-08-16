'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { EXHAUSTIVE_INTERESTS_CATALOG } from '../../../../../next-market/lib/interestCatalog'
import { extractBaseProduce } from '../../../../../next-market/lib/produceCatalog'
import ProduceAdPostCreatorModal, { AdPostModalContext } from '../../../../components/ProduceAdPostCreatorModal'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

type ViewMode = 'all' | 'buyers' | 'sellers' | 'overlap' | 'clusters'

export type MultiProduceCluster = {
  id: string
  produces: { name: string; displayCategory: string; image: string }[]
  produceNames: string[]
  zips: string[]
  zipCount: number
  totalBuyers: number
  adHook: string
}

export type RemainderProduceItem = {
  id: string
  name: string
  displayCategory: string
  image: string
  zips: string[]
  zipCount: number
  totalBuyers: number
  adHook: string
}

export type BuyerProduceDemand = {
  id: string
  name: string
  category: string
  displayCategory: string
  image: string
  buyersCount: number
  zipCount: number
  zipDetails: { zip: string; buyers: number; city?: string; state?: string }[]
  unit?: string
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
  unit?: string
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

const MARKET_BASE_URL = 
  process.env.NEXT_PUBLIC_APP_URL || 
  (typeof window !== 'undefined' && window.location.hostname.includes('staging') 
    ? 'https://market-staging.casagrown.com' 
    : 'https://casagrown.com')

function resolveImageUrl(url?: string): string {
  if (!url) return 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=400&q=80'
  if (url.startsWith('/')) {
    return `${MARKET_BASE_URL}${url}`
  }
  return url
}

function resolveProduceMeta(produceName: string) {
  const base = extractBaseProduce(produceName)
  return {
    baseId: base.id,
    baseName: base.name,
    displayCategory: base.displayCategory,
    image: resolveImageUrl(base.image),
    unit: base.unit || 'item',
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

  // On-demand Multi-Produce Multi-ZIP cluster finder state
  const [minProduceInput, setMinProduceInput] = useState<number>(3)
  const [minZipInput, setMinZipInput] = useState<number>(5)
  const [hasSearchedClusters, setHasSearchedClusters] = useState(false)
  const [isClustering, setIsClustering] = useState(false)
  const [discoveredClusters, setDiscoveredClusters] = useState<MultiProduceCluster[]>([])
  const [discoveredRemainder, setDiscoveredRemainder] = useState<RemainderProduceItem[]>([])
  const [clusterSort, setClusterSort] = useState<{ key: 'zipCount' | 'totalBuyers' | 'produceCount'; dir: SortDirection }>({
    key: 'zipCount',
    dir: 'desc',
  })

  // In-place Ad & Post Studio Modal State
  const [videoModal, setVideoModal] = useState<AdPostModalContext>({
    isOpen: false,
    contextType: 'buyer_single_produce',
    produceIds: [],
    produceNames: [],
    produceImages: [],
    topZips: [],
    metricsSummary: '',
  })

  const toast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 4000)
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text)
    toast(`Copied ${label} (${text}) to clipboard!`)
  }

  // Fast BigInt Bitmask Vector cluster finder algorithm
  const runFindClusters = useCallback(() => {
    setIsClustering(true)
    const minP = Math.max(1, Number(minProduceInput) || 1)
    const minZ = Math.max(1, Number(minZipInput) || 1)

    // Schedule on next tick so UI spinner renders immediately without hitching
    setTimeout(() => {
      // 1. Collect all unique ZIP codes and build index map
      const allZipsSet = new Set<string>()
      for (const b of buyerDemands) {
        for (const zd of b.zipDetails) {
          if (zd.zip) allZipsSet.add(zd.zip)
        }
      }
      const allZips = Array.from(allZipsSet).sort()
      const zipToIndex = new Map<string, number>()
      allZips.forEach((z, i) => zipToIndex.set(z, i))

      // Fast Brian Kernighan popcount on BigInt
      function popcount(mask: bigint): number {
        let count = 0
        let m = mask
        while (m > 0n) {
          m &= (m - 1n)
          count++
        }
        return count
      }

      // Convert a BigInt mask back to sorted array of ZIP strings
      function maskToZips(mask: bigint): string[] {
        const result: string[] = []
        let m = mask
        let bit = 0
        while (m > 0n) {
          if ((m & 1n) === 1n) {
            result.push(allZips[bit])
          }
          m >>= 1n
          bit++
        }
        return result.sort()
      }

      // 2. Build Produce Bitmask Vectors
      interface ProduceVec {
        name: string
        displayCategory: string
        image: string
        zipMask: bigint
        zipBuyers: Map<string, number>
        zipCount: number
        totalBuyers: number
      }

      const vectors: ProduceVec[] = []
      for (const b of buyerDemands) {
        if (b.zipDetails.length >= minZ) {
          let mask = 0n
          const zbMap = new Map<string, number>()
          let totalB = 0
          for (const zd of b.zipDetails) {
            const idx = zipToIndex.get(zd.zip)
            if (idx !== undefined) {
              mask |= (1n << BigInt(idx))
              zbMap.set(zd.zip, zd.buyers)
              totalB += zd.buyers
            }
          }
          const zCount = popcount(mask)
          if (zCount >= minZ) {
            vectors.push({
              name: b.name,
              displayCategory: b.displayCategory,
              image: b.image,
              zipMask: mask,
              zipBuyers: zbMap,
              zipCount: zCount,
              totalBuyers: totalB,
            })
          }
        }
      }

      // 3. Exact O(N^2) Sequential Row Grouping Scan
      const maxBundleSize = Math.min(8, Math.max(minP, minP + 4))
      const uniqueClusters: MultiProduceCluster[] = []
      const assigned = new Uint8Array(vectors.length) // 0 = unassigned, 1 = assigned

      for (let i = 0; i < vectors.length; i++) {
        if (assigned[i]) continue

        const clusterIndices = [i]
        let clusterMask = vectors[i].zipMask

        // If minP === 1, each qualifying vector can be its own cluster
        if (minP === 1) {
          assigned[i] = 1
          const commonZips = maskToZips(clusterMask)
          const previewZips = commonZips.slice(0, 3).join(', ') + (commonZips.length > 3 ? ` + ${commonZips.length - 3} more` : '')
          const adHook = `Attention local gardeners! Neighbors in ${previewZips} are actively looking to buy fresh ${vectors[i].name}. Have surplus in your yard or garden? Turn your harvest into income on CasaGrown!`
          uniqueClusters.push({
            id: vectors[i].name.toLowerCase().replace(/\s+/g, '_'),
            produces: [{ name: vectors[i].name, displayCategory: vectors[i].displayCategory, image: vectors[i].image }],
            produceNames: [vectors[i].name],
            zips: commonZips,
            zipCount: commonZips.length,
            totalBuyers: vectors[i].totalBuyers,
            adHook,
          })
          continue
        }

        // Scan all remaining unassigned crops to grow this cluster
        for (let j = i + 1; j < vectors.length; j++) {
          if (assigned[j]) continue
          if (clusterIndices.length >= maxBundleSize) break

          const testMask = clusterMask & vectors[j].zipMask
          if (popcount(testMask) >= minZ) {
            clusterIndices.push(j)
            clusterMask = testMask
          }
        }

        // If we gathered at least minProduce items in this cluster
        if (clusterIndices.length >= minP) {
          for (const idx of clusterIndices) {
            assigned[idx] = 1
          }

          const commonZips = maskToZips(clusterMask)
          const prodItems = clusterIndices.map(idx => vectors[idx])
          const prodNames = prodItems.map(p => p.name)
          let totalB = 0
          for (const item of prodItems) {
            for (const z of commonZips) {
              totalB += item.zipBuyers.get(z) || 1
            }
          }

          const clusterId = prodNames.slice().sort().join('_').toLowerCase().replace(/\s+/g, '_')
          const previewZips = commonZips.slice(0, 3).join(', ') + (commonZips.length > 3 ? ` + ${commonZips.length - 3} more` : '')
          const adHook = `Attention local gardeners! Neighbors in ${previewZips} are actively looking to buy fresh ${prodNames.join(', ')}. Have surplus in your yard or garden? Turn your harvest into income on CasaGrown!`

          uniqueClusters.push({
            id: clusterId,
            produces: prodItems.map(p => ({ name: p.name, displayCategory: p.displayCategory, image: p.image })),
            produceNames: prodNames,
            zips: commonZips,
            zipCount: commonZips.length,
            totalBuyers: totalB,
            adHook,
          })
        }
      }

      // 4. Remainder Produce: crops not bundled in any cluster
      const coveredProduce = new Set(uniqueClusters.flatMap(c => c.produceNames))
      const remainder: RemainderProduceItem[] = []

      for (const b of buyerDemands) {
        if (!coveredProduce.has(b.name) && b.zipDetails.length > 0) {
          const zips = b.zipDetails.map(zd => zd.zip).sort()
          const totalBuyers = b.zipDetails.reduce((acc, zd) => acc + zd.buyers, 0)
          const previewZips = zips.slice(0, 3).join(', ') + (zips.length > 3 ? ` + ${zips.length - 3} more` : '')
          const adHook = `Attention local gardeners! Neighbors in ${previewZips} are looking to buy fresh homegrown ${b.name}. Have extra harvest in your garden? Sell to your neighbors easily on CasaGrown!`

          remainder.push({
            id: b.id || b.name.toLowerCase().replace(/\s+/g, '_'),
            name: b.name,
            displayCategory: b.displayCategory,
            image: b.image,
            zips,
            zipCount: zips.length,
            totalBuyers,
            adHook,
          })
        }
      }

      remainder.sort((a, b) => b.totalBuyers - a.totalBuyers || b.zipCount - a.zipCount)
      uniqueClusters.sort((a, b) => b.zipCount - a.zipCount || b.totalBuyers - a.totalBuyers)

      setDiscoveredClusters(uniqueClusters)
      setDiscoveredRemainder(remainder)
      setHasSearchedClusters(true)
      setIsClustering(false)
      toast(`Found ${uniqueClusters.length} unique ad bundles and ${remainder.length} remainder single targets!`)
    }, 10)
  }, [buyerDemands, minProduceInput, minZipInput])

  // ── LIVE DATABASE FETCH ──────────────────────────────────────────
  const fetchDemandAndSupplyData = useCallback(async () => {
    setLoading(true)
    setDbError(null)

    try {
      // Fetch via server-side admin API (bypasses RLS restrictions for admin dashboards)
      const res = await fetch('/api/crm/produce-demand')
      let crmInterests: any[] = []
      let profiles: any[] = []
      let marketProducts: any[] = []
      let marketBooths: any[] = []

      if (res.ok) {
        const json = await res.json()
        crmInterests = json.crmInterests || []
        profiles = json.profiles || []
        marketProducts = json.marketProducts || []
        marketBooths = json.marketBooths || []
      } else {
        // Fallback to direct client
        const { data: d1 } = await supabase.from('crm_produce_interests').select('produce_name, interest_type, zipcodes, lead_id, user_id, status').eq('status', 'active')
        const { data: d2 } = await supabase.from('profiles').select('id, zip_code, city, state')
        const { data: d3 } = await supabase.from('market_products').select('name, category, seller_id').eq('is_active', true)
        const { data: d4 } = await supabase.from('market_booths').select('seller_id, booth_zip, pickup_zip, city, state').eq('status', 'active')
        crmInterests = d1 || []
        profiles = d2 || []
        marketProducts = d3 || []
        marketBooths = d4 || []
      }

      const profileMap = new Map<string, { zip: string; city: string; state: string }>()
      if (profiles) {
        for (const p of profiles) {
          if (p.zip_code) {
            profileMap.set(p.id, { zip: p.zip_code, city: p.city || '', state: p.state_code || p.state || '' })
          }
        }
      }

      const boothMap = new Map<string, { zip: string; city: string; state: string }>()
      if (marketBooths) {
        for (const b of marketBooths) {
          const zip = b.booth_zip || b.pickup_zip
          const owner = b.owner_id || b.seller_id
          if (zip && owner) {
            boothMap.set(owner, { zip, city: b.booth_city || b.city || '', state: b.booth_state || b.state || '' })
          }
        }
      }

      // ── Process Buyer Demand ─────────────────────────────────────
      // Map: canonical_base_name -> Map: zip -> { buyers: Set<buyer_id>, city, state }
      const buyerMap = new Map<string, Map<string, { buyers: Set<string>; city?: string; state?: string }>>()

      const recordBuyerInterest = (produce: string, zip: string, buyerId: string, city?: string, state?: string) => {
        if (!produce || !zip) return
        const meta = resolveProduceMeta(produce)
        const prodKey = meta.baseName // Group by canonical Base Produce Name (e.g. "Lemons", "Avocados", "Figs")
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

      // Add canonical buyer interests directly from crm_produce_interests
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

      // ── Process Seller Supply ────────────────────────────────────
      const sellerMap = new Map<string, Map<string, { sellers: Set<string>; city?: string; state?: string }>>()

      const recordSellerSupply = (produce: string, zip: string, sellerId: string, city?: string, state?: string) => {
        if (!produce || !zip) return
        const meta = resolveProduceMeta(produce)
        const prodKey = meta.baseName // Group by canonical Base Produce Name (e.g. "Lemons", "Avocados", "Figs")
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

      // Add canonical seller interests directly from crm_produce_interests
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

      // Add live market_products listings from sellers
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
      buyerMap.forEach((zMap, prodName) => {
        const allBuyers = new Set<string>()
        const zipDetails: { zip: string; buyers: number; city?: string; state?: string }[] = []

        zMap.forEach((info, z) => {
          info.buyers.forEach(b => allBuyers.add(b))
          zipDetails.push({
            zip: z,
            buyers: info.buyers.size,
            city: info.city,
            state: info.state,
          })
        })

        zipDetails.sort((a, b) => b.buyers - a.buyers)
        const meta = resolveProduceMeta(prodName)

        buyersList.push({
          id: meta.baseId,
          name: meta.baseName,
          category: meta.displayCategory.toLowerCase(),
          displayCategory: meta.displayCategory,
          image: meta.image,
          buyersCount: allBuyers.size,
          zipCount: zipDetails.length,
          zipDetails,
          unit: meta.unit,
        })
      })

      buyersList.sort((a, b) => b.buyersCount - a.buyersCount)
      setBuyerDemands(buyersList)

      // ── Format Seller Produce Supply list ────────────────────────
      const sellersList: SellerProduceSupply[] = []
      sellerMap.forEach((zMap, prodName) => {
        const allSellers = new Set<string>()
        const zipDetails: { zip: string; sellers: number; city?: string; state?: string }[] = []

        zMap.forEach((info, z) => {
          info.sellers.forEach(s => allSellers.add(s))
          zipDetails.push({
            zip: z,
            sellers: info.sellers.size,
            city: info.city,
            state: info.state,
          })
        })

        zipDetails.sort((a, b) => b.sellers - a.sellers)
        const meta = resolveProduceMeta(prodName)

        sellersList.push({
          id: meta.baseId,
          name: meta.baseName,
          category: meta.displayCategory.toLowerCase(),
          displayCategory: meta.displayCategory,
          image: meta.image,
          sellersCount: allSellers.size,
          zipCount: zipDetails.length,
          zipDetails,
          unit: meta.unit,
        })
      })

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
            unit: b.unit || 'item',
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
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={`/crm/creative-studio?source=produce-demand&produce=${encodeURIComponent(buyerDemands.slice(0, 4).map(b => b.name).join(',') || 'Meyer Lemons,Heirloom Tomatoes,Haas Avocados')}`}
              className="btn-create-ad"
              style={{
                background: 'linear-gradient(135deg, #15803D 0%, #16A34A 100%)',
                color: '#FFFFFF',
                textDecoration: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(21, 128, 61, 0.2)',
              }}
            >
              <span>✨</span>
              <span>AI Creative Studio</span>
            </a>
            <button className="btn-refresh" onClick={fetchDemandAndSupplyData} disabled={loading}>
              {loading ? 'Refreshing…' : '🔄 Refresh Data'}
            </button>
          </div>
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
            📋 All Tables
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
          <button
            id="btn-view-clusters"
            className={`mode-btn ${viewMode === 'clusters' ? 'active' : ''}`}
            onClick={() => setViewMode('clusters')}
          >
            📦 (d) Multi-Produce Ad Bundles {discoveredClusters.length > 0 ? `(${discoveredClusters.length} bundles, ${discoveredRemainder.length} single)` : ''}
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
                            <a
                              href={`/crm/creative-studio?source=produce-demand&produce=${encodeURIComponent(item.name)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '4px 8px',
                                background: '#0F172A',
                                color: '#FFFFFF',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                              }}
                              title="Open AI Creative Studio for this produce"
                            >
                              ✨ AI Studio
                            </a>
                            <button
                              onClick={() => setVideoModal({
                                isOpen: true,
                                initialPublishType: 'paid_ad',
                                contextType: 'seller_single_produce',
                                produceIds: [item.id],
                                produceNames: [item.name],
                                produceImages: [item.image],
                                topZips: item.zipDetails.map(z => z.zip),
                                metricsSummary: `${item.buyersCount} active buyers waiting across ${item.zipCount} ZIP codes (${item.zipDetails.slice(0, 3).map(z => z.city || z.zip).join(', ')})`,
                              })}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '4px 8px',
                                background: '#16A34A',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                              title="Launch targeted Paid Meta Ad campaign"
                            >
                              📢 Create Ad
                            </button>
                            <button
                              onClick={() => setVideoModal({
                                isOpen: true,
                                initialPublishType: 'organic_post',
                                contextType: 'seller_single_produce',
                                produceIds: [item.id],
                                produceNames: [item.name],
                                produceImages: [item.image],
                                topZips: item.zipDetails.map(z => z.zip),
                                metricsSummary: `${item.buyersCount} active buyers waiting across ${item.zipCount} ZIP codes (${item.zipDetails.slice(0, 3).map(z => z.city || z.zip).join(', ')})`,
                              })}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '4px 8px',
                                background: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                              title="Publish organic Facebook post"
                            >
                              📘 Create Post
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
                            <a
                              href={`/crm/creative-studio?source=produce-demand&produce=${encodeURIComponent(item.name)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '4px 8px',
                                background: '#0F172A',
                                color: '#FFFFFF',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                              }}
                              title="Open AI Creative Studio for this produce"
                            >
                              ✨ AI Studio
                            </a>
                            <button
                              onClick={() => setVideoModal({
                                isOpen: true,
                                initialPublishType: 'paid_ad',
                                contextType: 'buyer_single_produce',
                                produceIds: [item.id],
                                produceNames: [item.name],
                                produceImages: [item.image],
                                topZips: item.zipDetails.map(z => z.zip),
                                metricsSummary: `${item.sellersCount} active sellers with harvest ready across ${item.zipCount} ZIP codes (${item.zipDetails.slice(0, 3).map(z => z.city || z.zip).join(', ')})`,
                              })}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '4px 8px',
                                background: '#16A34A',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                              title="Launch targeted Paid Meta Ad campaign"
                            >
                              📢 Create Ad
                            </button>
                            <button
                              onClick={() => setVideoModal({
                                isOpen: true,
                                initialPublishType: 'organic_post',
                                contextType: 'buyer_single_produce',
                                produceIds: [item.id],
                                produceNames: [item.name],
                                produceImages: [item.image],
                                topZips: item.zipDetails.map(z => z.zip),
                                metricsSummary: `${item.sellersCount} active sellers with harvest ready across ${item.zipCount} ZIP codes (${item.zipDetails.slice(0, 3).map(z => z.city || z.zip).join(', ')})`,
                              })}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '4px 8px',
                                background: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                              title="Publish organic Facebook post"
                            >
                              📘 Create Post
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
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                            <a
                              href={`/crm/creative-studio?source=produce-demand&produce=${encodeURIComponent(item.produceName)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '3px 7px',
                                background: '#0F172A',
                                color: '#FFFFFF',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                              }}
                              title="Open AI Creative Studio"
                            >
                              ✨ AI Studio
                            </a>
                            <button
                              onClick={() => setVideoModal({
                                isOpen: true,
                                initialPublishType: 'paid_ad',
                                contextType: item.marketState === 'BUYER_DEFICIT' ? 'seller_single_produce' : 'buyer_single_produce',
                                produceIds: [item.produceId],
                                produceNames: [item.produceName],
                                produceImages: [item.image],
                                topZips: [item.zip],
                                metricsSummary: `${item.buyersCount} buyers vs ${item.sellersCount} sellers in ${item.zip} (${item.city}${item.state ? `, ${item.state}` : ''}) — ${item.marketState.replace('_', ' ')}`,
                              })}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '3px 7px',
                                background: '#16A34A',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                              title="Launch targeted Paid Meta Ad campaign"
                            >
                              📢 Create Ad
                            </button>
                            <button
                              onClick={() => setVideoModal({
                                isOpen: true,
                                initialPublishType: 'organic_post',
                                contextType: item.marketState === 'BUYER_DEFICIT' ? 'seller_single_produce' : 'buyer_single_produce',
                                produceIds: [item.produceId],
                                produceNames: [item.produceName],
                                produceImages: [item.image],
                                topZips: [item.zip],
                                metricsSummary: `${item.buyersCount} buyers vs ${item.sellersCount} sellers in ${item.zip} (${item.city}${item.state ? `, ${item.state}` : ''}) — ${item.marketState.replace('_', ' ')}`,
                              })}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '3px 7px',
                                background: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                              title="Publish organic Facebook post"
                            >
                              📘 Create Post
                            </button>
                          </div>
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

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TABLE (d): MULTI-PRODUCE MULTI-ZIP AD TARGET CLUSTERS          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {(viewMode === 'all' || viewMode === 'clusters') && (
        <div className="section-card cluster-section" id="multi-produce-cluster-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">📦 Table (d) — Multi-Produce Multi-ZIP Bundled Ad Targets</h2>
              <p className="section-desc">
                Target multiple in-demand crops in a single unified Meta ad across all ZIP codes that share simultaneous demand for every item in the bundle.
              </p>
            </div>
          </div>

          {/* On-Demand Cluster Controls */}
          <div className="cluster-finder-box">
            <div className="cluster-input-group">
              <div className="cluster-input-field">
                <label htmlFor="input-min-produces">Min Produces in Bundle:</label>
                <input
                  id="input-min-produces"
                  type="number"
                  min="1"
                  max="10"
                  value={minProduceInput}
                  onChange={e => setMinProduceInput(parseInt(e.target.value) || 1)}
                  className="number-input"
                />
              </div>
              <div className="cluster-input-field">
                <label htmlFor="input-min-zips">Min Qualifying ZIP Codes:</label>
                <input
                  id="input-min-zips"
                  type="number"
                  min="1"
                  max="100"
                  value={minZipInput}
                  onChange={e => setMinZipInput(parseInt(e.target.value) || 1)}
                  className="number-input"
                />
              </div>
              <button
                id="btn-run-cluster-finder"
                className="btn-find-clusters"
                onClick={runFindClusters}
                disabled={isClustering || loading}
              >
                {isClustering ? 'Finding Clusters…' : '🔍 Find Ad Target Clusters'}
              </button>
            </div>
            <p className="cluster-hint">
              Finds exact combinations where <strong>every ZIP in the group</strong> has active buyer demand for <strong>all of the bundled crops</strong>.
            </p>
          </div>

          {/* Table */}
          <div className="crm-table-wrap">
            <table id="multi-produce-clusters-table" className="crm-table sortable-table">
              <thead>
                <tr>
                  <th style={{ width: '32%' }}>Bundled Produce Items</th>
                  <th
                    style={{ width: '15%' }}
                    onClick={() => setClusterSort(s => ({ key: 'zipCount', dir: s.key === 'zipCount' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Target ZIPs ({minZipInput}+) {clusterSort.key === 'zipCount' ? (clusterSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th
                    style={{ width: '15%' }}
                    onClick={() => setClusterSort(s => ({ key: 'totalBuyers', dir: s.key === 'totalBuyers' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  >
                    Total Demand {clusterSort.key === 'totalBuyers' ? (clusterSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th style={{ width: '38%' }}>Meta Ads Export &amp; Unified Ad Copy</th>
                </tr>
              </thead>
              <tbody>
                {!hasSearchedClusters ? (
                  <tr>
                    <td colSpan={4} className="empty-td" style={{ padding: '32px 16px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#374151' }}>
                          ⚡ Cluster finder ready to compute
                        </p>
                        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                          Enter your minimum produce count and ZIP threshold above, then click <strong>"Find Ad Target Clusters"</strong>.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : discoveredClusters.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-td" style={{ padding: '32px 16px' }}>
                      No multi-produce clusters found with ≥{minProduceInput} crops across ≥{minZipInput} identical ZIP codes. Try lowering the thresholds.
                    </td>
                  </tr>
                ) : (
                  discoveredClusters.map(cluster => {
                    const zipListStr = cluster.zips.join(', ')
                    return (
                      <tr key={cluster.id}>
                        <td>
                          <div className="bundle-chips-wrap">
                            {cluster.produces.map(p => (
                              <div key={p.name} className="bundle-produce-chip">
                                <img src={p.image} alt={p.name} className="bundle-produce-thumb" />
                                <div>
                                  <span className="bundle-produce-name">{p.name}</span>
                                  <span className="bundle-produce-cat">{p.displayCategory}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className="zip-count-pill" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                            {cluster.zipCount} Shared ZIPs
                          </span>
                          <div className="zip-pills-wrap" style={{ marginTop: 6 }}>
                            {cluster.zips.slice(0, 5).map(z => (
                              <span key={z} className="zip-pill"><strong>{z}</strong></span>
                            ))}
                            {cluster.zips.length > 5 && (
                              <span className="zip-pill" style={{ background: '#f3f4f6' }}>
                                +{cluster.zips.length - 5} more
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="count-cell buyer-color">
                            <span className="count-num">{cluster.totalBuyers}</span>
                            <span className="count-sub">total buyers</span>
                          </div>
                        </td>
                        <td>
                          <div className="ad-box-wrap">
                            <p className="ad-hook-text">"{cluster.adHook}"</p>
                            <div className="ad-btn-row">
                              <button
                                className="btn-copy-zips"
                                onClick={() => copyToClipboard(zipListStr, `Cluster ZIPs (${cluster.zipCount} ZIPs)`)}
                                title="Copy all cluster ZIPs for Meta Ads"
                              >
                                📋 Copy {cluster.zipCount} ZIPs
                              </button>
                              <button
                                className="btn-copy-ad"
                                onClick={() => copyToClipboard(cluster.adHook, 'Multi-Produce Ad Copy')}
                                title="Copy pre-formatted Meta ad copy"
                              >
                                ✨ Copy Ad Copy
                              </button>
                              <a
                                href={`/crm/creative-studio?source=produce-demand&produce=${encodeURIComponent(cluster.produceNames.join(','))}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  padding: '4px 8px',
                                  background: '#0F172A',
                                  color: '#FFFFFF',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                  whiteSpace: 'nowrap',
                                }}
                                title="Open AI Creative Studio for this bundle"
                              >
                                ✨ AI Studio
                              </a>
                              <button
                                onClick={() => setVideoModal({
                                  isOpen: true,
                                  initialPublishType: 'paid_ad',
                                  contextType: 'seller_multi_produce',
                                  produceIds: cluster.produces.map(p => p.name.toLowerCase().replace(/\s+/g, '_')),
                                  produceNames: cluster.produceNames,
                                  produceImages: cluster.produces.map(p => p.image),
                                  topZips: cluster.zips,
                                  metricsSummary: `${cluster.totalBuyers} total buyers across ${cluster.zipCount} shared ZIPs (${cluster.zips.slice(0, 3).join(', ')})`,
                                })}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  padding: '4px 8px',
                                  background: '#16A34A',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                                title="Launch bundled Paid Meta Ad"
                              >
                                📢 Create Ad
                              </button>
                              <button
                                onClick={() => setVideoModal({
                                  isOpen: true,
                                  initialPublishType: 'organic_post',
                                  contextType: 'seller_multi_produce',
                                  produceIds: cluster.produces.map(p => p.name.toLowerCase().replace(/\s+/g, '_')),
                                  produceNames: cluster.produceNames,
                                  produceImages: cluster.produces.map(p => p.image),
                                  topZips: cluster.zips,
                                  metricsSummary: `${cluster.totalBuyers} total buyers across ${cluster.zipCount} shared ZIPs (${cluster.zips.slice(0, 3).join(', ')})`,
                                })}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  padding: '4px 8px',
                                  background: '#2563EB',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                                title="Publish bundled Facebook post"
                              >
                                📘 Create Post
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Remainder Single-Produce Ad Targets Section */}
          {hasSearchedClusters && discoveredRemainder.length > 0 && (
            <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '2px dashed #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🌱 Remainder Single-Produce Ad Targets</span>
                    <span style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                      {discoveredRemainder.length} Unbundled Crops
                    </span>
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                    These produce items were not absorbed into any multi-produce bundle. Launch dedicated single-crop ads or social posts for each to achieve 100% catalog demand coverage with zero waste.
                  </p>
                </div>
              </div>

              <div className="crm-table-wrap">
                <table id="remainder-produce-table" className="crm-table sortable-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Produce Item</th>
                      <th style={{ width: '25%' }}>Target ZIP Codes</th>
                      <th style={{ width: '15%' }}>Total Demand</th>
                      <th style={{ width: '35%' }}>Single-Crop Ad Copy &amp; Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveredRemainder.map(rem => {
                      const zipListStr = rem.zips.join(', ')
                      return (
                        <tr key={rem.id}>
                          <td>
                            <div className="bundle-chips-wrap">
                              <div className="bundle-produce-chip">
                                <img src={rem.image} alt={rem.name} className="bundle-produce-thumb" />
                                <div>
                                  <span className="bundle-produce-name">{rem.name}</span>
                                  <span className="bundle-produce-cat">{rem.displayCategory}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="zip-count-pill" style={{ background: '#ecfdf5', color: '#065f46' }}>
                              {rem.zipCount} Active ZIPs
                            </span>
                            <div className="zip-pills-wrap" style={{ marginTop: 6 }}>
                              {rem.zips.slice(0, 5).map(z => (
                                <span key={z} className="zip-pill"><strong>{z}</strong></span>
                              ))}
                              {rem.zips.length > 5 && (
                                <span className="zip-pill" style={{ background: '#f3f4f6' }}>
                                  +{rem.zips.length - 5} more
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="count-cell buyer-color">
                              <span className="count-num">{rem.totalBuyers}</span>
                              <span className="count-sub">total buyers</span>
                            </div>
                          </td>
                          <td>
                            <div className="ad-box-wrap">
                              <p className="ad-hook-text">"{rem.adHook}"</p>
                              <div className="ad-btn-row">
                                <button
                                  className="btn-copy-zips"
                                  onClick={() => copyToClipboard(zipListStr, `${rem.name} ZIPs (${rem.zipCount} ZIPs)`)}
                                  title="Copy all target ZIPs for Meta Ads"
                                >
                                  📋 Copy {rem.zipCount} ZIPs
                                </button>
                                <button
                                  className="btn-copy-ad"
                                  onClick={() => copyToClipboard(rem.adHook, `${rem.name} Ad Copy`)}
                                  title="Copy pre-formatted single-crop Meta ad copy"
                                >
                                  ✨ Copy Ad Copy
                                </button>
                                <a
                                  href={`/crm/creative-studio?source=produce-demand&produce=${encodeURIComponent(rem.name)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '4px 8px',
                                    background: '#0F172A',
                                    color: '#FFFFFF',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title="Open AI Creative Studio for this crop"
                                >
                                  ✨ AI Studio
                                </a>
                                <button
                                  onClick={() => setVideoModal({
                                    isOpen: true,
                                    initialPublishType: 'paid_ad',
                                    contextType: 'seller_single_produce',
                                    produceIds: [rem.id],
                                    produceNames: [rem.name],
                                    produceImages: [rem.image],
                                    topZips: rem.zips,
                                    metricsSummary: `${rem.totalBuyers} total buyers across ${rem.zipCount} ZIPs (${rem.zips.slice(0, 3).join(', ')})`,
                                  })}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '4px 8px',
                                    background: '#16A34A',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title="Launch single-crop Paid Meta Ad"
                                >
                                  📢 Create Ad
                                </button>
                                <button
                                  onClick={() => setVideoModal({
                                    isOpen: true,
                                    initialPublishType: 'organic_post',
                                    contextType: 'seller_single_produce',
                                    produceIds: [rem.id],
                                    produceNames: [rem.name],
                                    produceImages: [rem.image],
                                    topZips: rem.zips,
                                    metricsSummary: `${rem.totalBuyers} total buyers across ${rem.zipCount} ZIPs (${rem.zips.slice(0, 3).join(', ')})`,
                                  })}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '4px 8px',
                                    background: '#2563EB',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title="Publish single-crop Facebook post"
                                >
                                  📘 Create Post
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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

        /* ── Cluster Finder Specific Styles ── */
        .cluster-section {
          border-left: 4px solid #6366f1;
        }

        .cluster-finder-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 18px 20px;
          border-radius: 10px;
          margin-bottom: 20px;
        }

        .cluster-input-group {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }

        .cluster-input-field {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.88rem;
          font-weight: 600;
          color: #334155;
        }

        .number-input {
          width: 70px;
          padding: 8px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.95rem;
          font-weight: 700;
          color: #0f172a;
          background: #ffffff;
        }

        .number-input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        .btn-find-clusters {
          background: #4f46e5;
          color: #ffffff;
          border: none;
          padding: 9px 18px;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);
        }

        .btn-find-clusters:hover:not(:disabled) {
          background: #4338ca;
        }

        .btn-find-clusters:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .cluster-hint {
          font-size: 0.78rem;
          color: #64748b;
          margin: 10px 0 0;
          line-height: 1.4;
        }

        /* Bundle Chips & Ad Box */
        .bundle-chips-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .bundle-produce-chip {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          padding: 6px 10px;
          border-radius: 8px;
        }

        .bundle-produce-thumb {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          object-fit: cover;
        }

        .bundle-produce-name {
          display: block;
          font-size: 0.88rem;
          font-weight: 700;
          color: #0f172a;
        }

        .bundle-produce-cat {
          display: block;
          font-size: 0.72rem;
          color: #64748b;
        }

        .ad-box-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ad-hook-text {
          margin: 0;
          font-size: 0.8rem;
          color: #334155;
          font-style: italic;
          background: #f8fafc;
          border-left: 3px solid #6366f1;
          padding: 8px 10px;
          border-radius: 0 6px 6px 0;
          line-height: 1.4;
        }

        .ad-btn-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .btn-copy-ad {
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          color: #4338ca;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-copy-ad:hover {
          background: #e0e7ff;
        }
      `}</style>

      {/* In-place Ad & Post Campaign Creator Dialog */}
      <ProduceAdPostCreatorModal
        modalContext={videoModal}
        onClose={() => setVideoModal((prev: AdPostModalContext) => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
