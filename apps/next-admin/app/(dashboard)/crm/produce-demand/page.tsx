'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '../../../lib/supabase'

type ViewMode = 'all' | 'buyers' | 'sellers' | 'overlap'

export type BuyerProduceDemand = {
  id: string
  name: string
  category: string
  displayCategory: string
  image: string
  buyersCount: number
  zipCount: number
  zipDetails: { zip: string; buyers: number; city?: string }[]
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
  zipDetails: { zip: string; sellers: number; city?: string }[]
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
  buyersCount: number
  sellersCount: number
  totalActivity: number
  buyerSellerRatio: number
  marketState: 'BUYER_DEFICIT' | 'BALANCED' | 'SELLER_SURPLUS'
  unit: string
}

// Canonical California / South Bay produce demand dataset
const INITIAL_BUYER_DEMAND: BuyerProduceDemand[] = [
  {
    id: 'heirloom_tomatoes',
    name: 'Heirloom Tomatoes',
    category: 'produce',
    displayCategory: 'Vegetables',
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
    buyersCount: 84,
    zipCount: 12,
    zipDetails: [
      { zip: '95125', buyers: 22, city: 'San Jose (Willow Glen)' },
      { zip: '95126', buyers: 18, city: 'San Jose (Rose Garden)' },
      { zip: '95128', buyers: 15, city: 'San Jose (Midtown)' },
      { zip: '94024', buyers: 11, city: 'Los Altos' },
      { zip: '94040', buyers: 10, city: 'Mountain View' },
      { zip: '94022', buyers: 8, city: 'Los Altos Hills' },
    ],
    unit: 'lb',
  },
  {
    id: 'lemons',
    name: 'Meyer Lemons',
    category: 'produce',
    displayCategory: 'Citrus',
    image: 'https://images.unsplash.com/photo-1534531141738-9e530663737a?auto=format&fit=crop&w=400&q=80',
    buyersCount: 68,
    zipCount: 9,
    zipDetails: [
      { zip: '95125', buyers: 20, city: 'San Jose (Willow Glen)' },
      { zip: '95126', buyers: 16, city: 'San Jose (Rose Garden)' },
      { zip: '95128', buyers: 14, city: 'San Jose (Midtown)' },
      { zip: '94024', buyers: 10, city: 'Los Altos' },
      { zip: '94040', buyers: 8, city: 'Mountain View' },
    ],
    unit: 'lb',
  },
  {
    id: 'oranges',
    name: 'Valencia Oranges',
    category: 'produce',
    displayCategory: 'Citrus',
    image: 'https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=400&q=80',
    buyersCount: 61,
    zipCount: 8,
    zipDetails: [
      { zip: '95125', buyers: 18, city: 'San Jose (Willow Glen)' },
      { zip: '95128', buyers: 15, city: 'San Jose (Midtown)' },
      { zip: '95126', buyers: 12, city: 'San Jose (Rose Garden)' },
      { zip: '94024', buyers: 9, city: 'Los Altos' },
      { zip: '94087', buyers: 7, city: 'Sunnyvale' },
    ],
    unit: 'bag',
  },
  {
    id: 'avocados',
    name: 'Hass Avocados',
    category: 'produce',
    displayCategory: 'Fruit',
    image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=400&q=80',
    buyersCount: 55,
    zipCount: 7,
    zipDetails: [
      { zip: '95125', buyers: 16, city: 'San Jose (Willow Glen)' },
      { zip: '94024', buyers: 14, city: 'Los Altos' },
      { zip: '94040', buyers: 11, city: 'Mountain View' },
      { zip: '95126', buyers: 8, city: 'San Jose (Rose Garden)' },
      { zip: '94022', buyers: 6, city: 'Los Altos Hills' },
    ],
    unit: 'bag',
  },
  {
    id: 'limes',
    name: 'Persian Limes',
    category: 'produce',
    displayCategory: 'Citrus',
    image: 'https://images.unsplash.com/photo-1590502160462-0e95ee2698e8?auto=format&fit=crop&w=400&q=80',
    buyersCount: 52,
    zipCount: 6,
    zipDetails: [
      { zip: '95125', buyers: 15, city: 'San Jose (Willow Glen)' },
      { zip: '95128', buyers: 13, city: 'San Jose (Midtown)' },
      { zip: '95126', buyers: 11, city: 'San Jose (Rose Garden)' },
      { zip: '94024', buyers: 8, city: 'Los Altos' },
      { zip: '94087', buyers: 5, city: 'Sunnyvale' },
    ],
    unit: 'lb',
  },
  {
    id: 'figs',
    name: 'Mission & Kadota Figs',
    category: 'produce',
    displayCategory: 'Fruit',
    image: 'https://images.unsplash.com/photo-1601379327928-bedfaf9da2d0?auto=format&fit=crop&w=400&q=80',
    buyersCount: 48,
    zipCount: 6,
    zipDetails: [
      { zip: '94022', buyers: 14, city: 'Los Altos Hills' },
      { zip: '94040', buyers: 12, city: 'Mountain View' },
      { zip: '94024', buyers: 10, city: 'Los Altos' },
      { zip: '95125', buyers: 7, city: 'San Jose (Willow Glen)' },
      { zip: '95126', buyers: 5, city: 'San Jose (Rose Garden)' },
    ],
    unit: 'lb',
  },
  {
    id: 'sweet_corn',
    name: 'Sweet Corn',
    category: 'produce',
    displayCategory: 'Vegetables',
    image: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=400&q=80',
    buyersCount: 45,
    zipCount: 5,
    zipDetails: [
      { zip: '95125', buyers: 14, city: 'San Jose (Willow Glen)' },
      { zip: '95128', buyers: 11, city: 'San Jose (Midtown)' },
      { zip: '95126', buyers: 9, city: 'San Jose (Rose Garden)' },
      { zip: '94024', buyers: 6, city: 'Los Altos' },
      { zip: '94087', buyers: 5, city: 'Sunnyvale' },
    ],
    unit: 'dozen',
  },
  {
    id: 'basil',
    name: 'Fresh Sweet Basil',
    category: 'herbs',
    displayCategory: 'Herbs',
    image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80',
    buyersCount: 44,
    zipCount: 6,
    zipDetails: [
      { zip: '95125', buyers: 12, city: 'San Jose (Willow Glen)' },
      { zip: '95126', buyers: 10, city: 'San Jose (Rose Garden)' },
      { zip: '94040', buyers: 8, city: 'Mountain View' },
      { zip: '95128', buyers: 8, city: 'San Jose (Midtown)' },
      { zip: '94024', buyers: 6, city: 'Los Altos' },
    ],
    unit: 'bunch',
  },
  {
    id: 'mandarins',
    name: 'Satsuma Mandarins',
    category: 'produce',
    displayCategory: 'Citrus',
    image: 'https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=400&q=80',
    buyersCount: 45,
    zipCount: 5,
    zipDetails: [
      { zip: '95125', buyers: 15, city: 'San Jose (Willow Glen)' },
      { zip: '95128', buyers: 12, city: 'San Jose (Midtown)' },
      { zip: '95126', buyers: 9, city: 'San Jose (Rose Garden)' },
      { zip: '94024', buyers: 5, city: 'Los Altos' },
      { zip: '94087', buyers: 4, city: 'Sunnyvale' },
    ],
    unit: 'bag',
  },
  {
    id: 'pasture_eggs',
    name: 'Pasture-Raised Eggs',
    category: 'eggs',
    displayCategory: 'Eggs & Dairy',
    image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=400&q=80',
    buyersCount: 39,
    zipCount: 5,
    zipDetails: [
      { zip: '95125', buyers: 12, city: 'San Jose (Willow Glen)' },
      { zip: '94024', buyers: 9, city: 'Los Altos' },
      { zip: '94040', buyers: 8, city: 'Mountain View' },
      { zip: '95128', buyers: 6, city: 'San Jose (Midtown)' },
      { zip: '95126', buyers: 4, city: 'San Jose (Rose Garden)' },
    ],
    unit: 'dozen',
  },
  {
    id: 'raw_honey',
    name: 'Wildflower Honey',
    category: 'honey',
    displayCategory: 'Honey',
    image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=400&q=80',
    buyersCount: 36,
    zipCount: 4,
    zipDetails: [
      { zip: '95125', buyers: 13, city: 'San Jose (Willow Glen)' },
      { zip: '94024', buyers: 10, city: 'Los Altos' },
      { zip: '94040', buyers: 8, city: 'Mountain View' },
      { zip: '95128', buyers: 5, city: 'San Jose (Midtown)' },
    ],
    unit: 'jar',
  },
]

// Canonical Seller supply dataset
const INITIAL_SELLER_SUPPLY: SellerProduceSupply[] = [
  {
    id: 'heirloom_tomatoes',
    name: 'Heirloom Tomatoes',
    category: 'produce',
    displayCategory: 'Vegetables',
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
    sellersCount: 31,
    zipCount: 9,
    zipDetails: [
      { zip: '95125', sellers: 8, city: 'San Jose (Willow Glen)' },
      { zip: '95128', sellers: 6, city: 'San Jose (Midtown)' },
      { zip: '95126', sellers: 5, city: 'San Jose (Rose Garden)' },
      { zip: '94024', sellers: 4, city: 'Los Altos' },
      { zip: '94040', sellers: 4, city: 'Mountain View' },
      { zip: '94022', sellers: 4, city: 'Los Altos Hills' },
    ],
    unit: 'lb',
  },
  {
    id: 'lemons',
    name: 'Meyer Lemons',
    category: 'produce',
    displayCategory: 'Citrus',
    image: 'https://images.unsplash.com/photo-1534531141738-9e530663737a?auto=format&fit=crop&w=400&q=80',
    sellersCount: 24,
    zipCount: 7,
    zipDetails: [
      { zip: '95125', sellers: 7, city: 'San Jose (Willow Glen)' },
      { zip: '95126', sellers: 5, city: 'San Jose (Rose Garden)' },
      { zip: '95128', sellers: 4, city: 'San Jose (Midtown)' },
      { zip: '94024', sellers: 4, city: 'Los Altos' },
      { zip: '94040', sellers: 4, city: 'Mountain View' },
    ],
    unit: 'lb',
  },
  {
    id: 'oranges',
    name: 'Valencia Oranges',
    category: 'produce',
    displayCategory: 'Citrus',
    image: 'https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=400&q=80',
    sellersCount: 22,
    zipCount: 6,
    zipDetails: [
      { zip: '95125', sellers: 6, city: 'San Jose (Willow Glen)' },
      { zip: '95128', sellers: 5, city: 'San Jose (Midtown)' },
      { zip: '95126', sellers: 4, city: 'San Jose (Rose Garden)' },
      { zip: '94024', sellers: 4, city: 'Los Altos' },
      { zip: '94087', sellers: 3, city: 'Sunnyvale' },
    ],
    unit: 'bag',
  },
  {
    id: 'avocados',
    name: 'Hass Avocados',
    category: 'produce',
    displayCategory: 'Fruit',
    image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=400&q=80',
    sellersCount: 21,
    zipCount: 5,
    zipDetails: [
      { zip: '95125', sellers: 6, city: 'San Jose (Willow Glen)' },
      { zip: '94024', sellers: 5, city: 'Los Altos' },
      { zip: '94040', sellers: 4, city: 'Mountain View' },
      { zip: '95126', sellers: 3, city: 'San Jose (Rose Garden)' },
      { zip: '94022', sellers: 3, city: 'Los Altos Hills' },
    ],
    unit: 'bag',
  },
  {
    id: 'limes',
    name: 'Persian Limes',
    category: 'produce',
    displayCategory: 'Citrus',
    image: 'https://images.unsplash.com/photo-1590502160462-0e95ee2698e8?auto=format&fit=crop&w=400&q=80',
    sellersCount: 19,
    zipCount: 5,
    zipDetails: [
      { zip: '95125', sellers: 5, city: 'San Jose (Willow Glen)' },
      { zip: '95128', sellers: 5, city: 'San Jose (Midtown)' },
      { zip: '95126', sellers: 4, city: 'San Jose (Rose Garden)' },
      { zip: '94024', sellers: 3, city: 'Los Altos' },
      { zip: '94087', sellers: 2, city: 'Sunnyvale' },
    ],
    unit: 'lb',
  },
  {
    id: 'basil',
    name: 'Fresh Sweet Basil',
    category: 'herbs',
    displayCategory: 'Herbs',
    image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80',
    sellersCount: 16,
    zipCount: 5,
    zipDetails: [
      { zip: '95125', sellers: 5, city: 'San Jose (Willow Glen)' },
      { zip: '95126', sellers: 4, city: 'San Jose (Rose Garden)' },
      { zip: '94040', sellers: 3, city: 'Mountain View' },
      { zip: '95128', sellers: 2, city: 'San Jose (Midtown)' },
      { zip: '94024', sellers: 2, city: 'Los Altos' },
    ],
    unit: 'bunch',
  },
  {
    id: 'mandarins',
    name: 'Satsuma Mandarins',
    category: 'produce',
    displayCategory: 'Citrus',
    image: 'https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=400&q=80',
    sellersCount: 16,
    zipCount: 5,
    zipDetails: [
      { zip: '95125', sellers: 5, city: 'San Jose (Willow Glen)' },
      { zip: '95128', sellers: 4, city: 'San Jose (Midtown)' },
      { zip: '95126', sellers: 3, city: 'San Jose (Rose Garden)' },
      { zip: '94024', sellers: 2, city: 'Los Altos' },
      { zip: '94087', sellers: 2, city: 'Sunnyvale' },
    ],
    unit: 'bag',
  },
  {
    id: 'sweet_corn',
    name: 'Sweet Corn',
    category: 'produce',
    displayCategory: 'Vegetables',
    image: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=400&q=80',
    sellersCount: 15,
    zipCount: 4,
    zipDetails: [
      { zip: '95125', sellers: 5, city: 'San Jose (Willow Glen)' },
      { zip: '95128', sellers: 4, city: 'San Jose (Midtown)' },
      { zip: '95126', sellers: 3, city: 'San Jose (Rose Garden)' },
      { zip: '94024', sellers: 3, city: 'Los Altos' },
    ],
    unit: 'dozen',
  },
  {
    id: 'figs',
    name: 'Mission & Kadota Figs',
    category: 'produce',
    displayCategory: 'Fruit',
    image: 'https://images.unsplash.com/photo-1601379327928-bedfaf9da2d0?auto=format&fit=crop&w=400&q=80',
    sellersCount: 14,
    zipCount: 4,
    zipDetails: [
      { zip: '94022', sellers: 5, city: 'Los Altos Hills' },
      { zip: '94040', sellers: 4, city: 'Mountain View' },
      { zip: '94024', sellers: 3, city: 'Los Altos' },
      { zip: '95125', sellers: 2, city: 'San Jose (Willow Glen)' },
    ],
    unit: 'lb',
  },
  {
    id: 'pasture_eggs',
    name: 'Pasture-Raised Eggs',
    category: 'eggs',
    displayCategory: 'Eggs & Dairy',
    image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=400&q=80',
    sellersCount: 11,
    zipCount: 4,
    zipDetails: [
      { zip: '95125', sellers: 4, city: 'San Jose (Willow Glen)' },
      { zip: '94024', sellers: 3, city: 'Los Altos' },
      { zip: '94040', sellers: 2, city: 'Mountain View' },
      { zip: '95128', sellers: 2, city: 'San Jose (Midtown)' },
    ],
    unit: 'dozen',
  },
  {
    id: 'raw_honey',
    name: 'Wildflower Honey',
    category: 'honey',
    displayCategory: 'Honey',
    image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=400&q=80',
    sellersCount: 8,
    zipCount: 3,
    zipDetails: [
      { zip: '95125', sellers: 3, city: 'San Jose (Willow Glen)' },
      { zip: '94024', sellers: 3, city: 'Los Altos' },
      { zip: '94040', sellers: 2, city: 'Mountain View' },
    ],
    unit: 'jar',
  },
]

// Generate Overlap Matrix (Table c) where BOTH buyers > 0 and sellers > 0 in the same zipcode
function computeOverlaps(
  buyers: BuyerProduceDemand[],
  sellers: SellerProduceSupply[]
): ProduceZipOverlap[] {
  const overlaps: ProduceZipOverlap[] = []
  const sellerMap = new Map<string, Map<string, { count: number; city: string }>>()

  for (const s of sellers) {
    const zMap = new Map<string, { count: number; city: string }>()
    for (const z of s.zipDetails) {
      zMap.set(z.zip, { count: z.sellers, city: z.city || '' })
    }
    sellerMap.set(s.id, zMap)
  }

  for (const b of buyers) {
    const sZMap = sellerMap.get(b.id)
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
}

type BuyerSortKey = 'name' | 'displayCategory' | 'buyersCount' | 'zipCount'
type SellerSortKey = 'name' | 'displayCategory' | 'sellersCount' | 'zipCount'
type OverlapSortKey = 'produceName' | 'zip' | 'buyersCount' | 'sellersCount' | 'totalActivity' | 'buyerSellerRatio'
type SortDirection = 'asc' | 'desc'

export default function ProduceDemandPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [buyerDemands, setBuyerDemands] = useState<BuyerProduceDemand[]>(INITIAL_BUYER_DEMAND)
  const [sellerSupplies, setSellerSupplies] = useState<SellerProduceSupply[]>(INITIAL_SELLER_SUPPLY)

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

  // Overlap list
  const overlapList = useMemo(() => {
    return computeOverlaps(buyerDemands, sellerSupplies)
  }, [buyerDemands, sellerSupplies])

  // Filtered & Sorted Table (a): Buyer Demand
  const filteredBuyerDemands = useMemo(() => {
    return buyerDemands
      .filter(item => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.displayCategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.zipDetails.some(z => z.zip.includes(searchQuery.trim()) || (z.city && z.city.toLowerCase().includes(searchQuery.toLowerCase())))

        const matchesCat = categoryFilter === 'ALL' || item.displayCategory.toUpperCase() === categoryFilter.toUpperCase()
        const matchesCount = minCountFilter === 0 || item.buyersCount >= minCountFilter

        return matchesSearch && matchesCat && matchesCount
      })
      .sort((a, b) => {
        let valA = a[buyerSort.key]
        let valB = b[buyerSort.key]
        if (typeof valA === 'string') {
          return buyerSort.dir === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA)
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
          item.zipDetails.some(z => z.zip.includes(searchQuery.trim()) || (z.city && z.city.toLowerCase().includes(searchQuery.toLowerCase())))

        const matchesCat = categoryFilter === 'ALL' || item.displayCategory.toUpperCase() === categoryFilter.toUpperCase()
        const matchesCount = minCountFilter === 0 || item.sellersCount >= minCountFilter

        return matchesSearch && matchesCat && matchesCount
      })
      .sort((a, b) => {
        let valA = a[sellerSort.key]
        let valB = b[sellerSort.key]
        if (typeof valA === 'string') {
          return sellerSort.dir === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA)
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
          item.city.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesCat = categoryFilter === 'ALL' || item.displayCategory.toUpperCase() === categoryFilter.toUpperCase()
        const matchesCount = minCountFilter === 0 || (item.buyersCount >= minCountFilter || item.sellersCount >= minCountFilter)

        return matchesSearch && matchesCat && matchesCount
      })
      .sort((a, b) => {
        let valA = a[overlapSort.key]
        let valB = b[overlapSort.key]
        if (typeof valA === 'string') {
          return overlapSort.dir === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA)
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
        <div>
          <h1 className="crm-title">Produce Demand &amp; Supply Intelligence Radar</h1>
          <p className="crm-subtitle">
            Inspect localized buyer demand, seller supply, and matched liquidity per ZIP code to prioritize where and for which produce to generate ads.
          </p>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="crm-toast success">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage('')} className="toast-close">✕</button>
        </div>
      )}

      {/* ── KPI Summary Cards ── */}
      <div className="kpi-grid">
        <div className="kpi-card buyer-kpi">
          <div className="kpi-label">Total Buyer Demand</div>
          <div className="kpi-value">{totalBuyers} Buyers</div>
          <div className="kpi-sub">Across {uniqueDemandZips} distinct ZIP codes</div>
        </div>
        <div className="kpi-card seller-kpi">
          <div className="kpi-label">Total Seller Supply</div>
          <div className="kpi-value">{totalSellers} Sellers</div>
          <div className="kpi-sub">Across {uniqueSupplyZips} distinct ZIP codes</div>
        </div>
        <div className="kpi-card overlap-kpi">
          <div className="kpi-label">Matched Produce-ZIP Pairs</div>
          <div className="kpi-value">{overlapList.length} Liquid Markets</div>
          <div className="kpi-sub">Both buyers &amp; sellers present in same ZIP</div>
        </div>
        <div className="kpi-card top-kpi">
          <div className="kpi-label">Top Demand Leader</div>
          <div className="kpi-value">{buyerDemands[0]?.name || 'Heirloom Tomatoes'}</div>
          <div className="kpi-sub">{buyerDemands[0]?.buyersCount} buyers in {buyerDemands[0]?.zipCount} ZIPs</div>
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
              placeholder="Search produce name, category, or ZIP (e.g. 95125, Meyer Lemons)..."
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
                Shows all produce items where local neighbors are actively looking to buy, with full ZIP code distribution.
              </p>
            </div>
            <span className="sort-hint">Click column headers to sort</span>
          </div>

          <div className="crm-table-wrap">
            <table className="crm-table sortable-table">
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
                {filteredBuyerDemands.length === 0 ? (
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
                              <span key={z.zip} className="zip-pill" title={`${z.buyers} buyers in ${z.zip} - ${z.city}`}>
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
                Shows all produce items where local growers have active trees, gardens, or listings available.
              </p>
            </div>
            <span className="sort-hint">Click column headers to sort</span>
          </div>

          <div className="crm-table-wrap">
            <table className="crm-table sortable-table">
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
                {filteredSellerSupplies.length === 0 ? (
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
                              <span key={z.zip} className="zip-pill seller-pill" title={`${z.sellers} sellers in ${z.zip} - ${z.city}`}>
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
            <table className="crm-table sortable-table">
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
                {filteredOverlaps.length === 0 ? (
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
                          <span className="city-sub">{item.city}</span>
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

        .toast-close {
          background: none;
          border: none;
          font-size: 1rem;
          cursor: pointer;
          color: #065f46;
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
