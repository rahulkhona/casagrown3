'use client'

import React, { useState, useMemo, useEffect, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useReferralCapture, getReferralData } from '../../../lib/useReferralCapture'
import { createClient } from '../../../lib/supabase'
import { Navbar } from '../../components/Navbar'
import { BottomNav } from '../../components/BottomNav'
import { MarketProvider } from '../../../lib/store'
import { CartProvider } from '../../../lib/useCart'
import { BootstrapProvider, useBootstrap } from '../../../lib/useBootstrap'
import { QuickSetupProvider, useQuickSetup } from '../../../lib/useQuickSetup'
import { ErrorToastProvider } from '../../components/ErrorToast'
import AddressInput from '../../components/AddressInput'
import { type AddressFields, formatFullAddress, EMPTY_ADDRESS } from '../../../lib/address'

interface ProduceItem {
  id: string
  name: string
  category: 'produce' | 'flowers' | 'flower_arrangements' | 'garden_equipment' | 'pots' | 'soil' | 'seeds' | 'seedlings' | 'plants' | 'eggs' | 'honey'
  displayCategory: string
  image: string
  buyersCount: number
  sellersCount: number
  unit: string
}

// Master Backyard Catalog — Focused on Produce, Plants, Seeds & Homestead Eggs
const EXHAUSTIVE_US_PRODUCE: ProduceItem[] = [
  // ── CITRUS & SUBTROPICAL ──
  { id: 'lemons', name: 'Lemons', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1534706936160-d5ee67737249?w=600&auto=format&fit=crop&q=80', buyersCount: 34, sellersCount: 12, unit: 'lb' },
  { id: 'limes', name: 'Limes', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=600&auto=format&fit=crop&q=80', buyersCount: 32, sellersCount: 9, unit: 'lb' },
  { id: 'oranges', name: 'Oranges', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=600&auto=format&fit=crop&q=80', buyersCount: 50, sellersCount: 16, unit: 'bag' },
  { id: 'grapefruit', name: 'Grapefruit', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1577234286642-fc512a5f8f11?w=600&auto=format&fit=crop&q=80', buyersCount: 14, sellersCount: 4, unit: 'bag' },
  { id: 'tangerines', name: 'Tangerines & Mandarins', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1557800636-894a64c1696f?w=600&auto=format&fit=crop&q=80', buyersCount: 25, sellersCount: 8, unit: 'bag' },
  { id: 'kumquats', name: 'Kumquats', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1592187270271-9a4b84faf547?w=600&auto=format&fit=crop&q=80', buyersCount: 11, sellersCount: 3, unit: 'pint' },

  // ── TOP VEGETABLES ──
  { id: 'tomatoes', name: 'Heirloom Tomatoes', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop&q=80', buyersCount: 81, sellersCount: 34, unit: 'lb' },
  { id: 'cherry_tomatoes', name: 'Cherry Tomatoes', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1561136594-7f68413baa99?w=600&auto=format&fit=crop&q=80', buyersCount: 42, sellersCount: 16, unit: 'pint' },
  { id: 'sweet_peppers', name: 'Sweet Bell Peppers', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=600&auto=format&fit=crop&q=80', buyersCount: 45, sellersCount: 16, unit: 'lb' },
  { id: 'hot_peppers', name: 'Hot Peppers & Chilies', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=600&auto=format&fit=crop&q=80', buyersCount: 39, sellersCount: 14, unit: 'lb' },
  { id: 'cucumbers', name: 'Cucumbers', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=600&auto=format&fit=crop&q=80', buyersCount: 31, sellersCount: 11, unit: 'lb' },
  { id: 'zucchini', name: 'Zucchini', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1598170845058-12f9a4a5f474?w=600&auto=format&fit=crop&q=80', buyersCount: 38, sellersCount: 14, unit: 'lb' },
  { id: 'yellow_squash', name: 'Yellow Summer Squash', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1598170845058-12f9a4a5f474?w=600&auto=format&fit=crop&q=80', buyersCount: 21, sellersCount: 7, unit: 'lb' },
  { id: 'eggplant', name: 'Globe Eggplant', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop&q=80', buyersCount: 18, sellersCount: 5, unit: 'lb' },
  { id: 'green_beans', name: 'Green Beans & Peas', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1567375698348-5d9d5ae99de0?w=600&auto=format&fit=crop&q=80', buyersCount: 36, sellersCount: 12, unit: 'lb' },
  { id: 'kale', name: 'Kale & Collard Greens', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1524179091875-bf98a9a6ae52?w=600&auto=format&fit=crop&q=80', buyersCount: 42, sellersCount: 15, unit: 'bunch' },
  { id: 'lettuce', name: 'Lettuce & Salad Greens', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=600&auto=format&fit=crop&q=80', buyersCount: 30, sellersCount: 10, unit: 'head' },
  { id: 'spinach', name: 'Spinach & Swiss Chard', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=600&auto=format&fit=crop&q=80', buyersCount: 28, sellersCount: 9, unit: 'lb' },
  { id: 'carrots', name: 'Carrots & Beets', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1598170845058-12f9a4a5f474?w=600&auto=format&fit=crop&q=80', buyersCount: 35, sellersCount: 12, unit: 'bunch' },
  { id: 'radishes', name: 'Radishes', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1592417817098-8f3d6eb19655?w=600&auto=format&fit=crop&q=80', buyersCount: 19, sellersCount: 6, unit: 'bunch' },
  { id: 'potatoes', name: 'Potatoes & Sweet Potatoes', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&auto=format&fit=crop&q=80', buyersCount: 40, sellersCount: 14, unit: 'lb' },
  { id: 'onions', name: 'Onions & Scallions', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1587049693270-e42753ee9d30?w=600&auto=format&fit=crop&q=80', buyersCount: 52, sellersCount: 18, unit: 'bunch' },
  { id: 'garlic', name: 'Garlic', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?w=600&auto=format&fit=crop&q=80', buyersCount: 40, sellersCount: 14, unit: 'head' },
  { id: 'sweet_corn', name: 'Sweet Corn', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=600&auto=format&fit=crop&q=80', buyersCount: 45, sellersCount: 15, unit: 'dozen' },
  { id: 'okra', name: 'Okra', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=600&auto=format&fit=crop&q=80', buyersCount: 16, sellersCount: 5, unit: 'lb' },
  { id: 'pumpkins', name: 'Pumpkins & Winter Squash', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1508747703725-719777637510?w=600&auto=format&fit=crop&q=80', buyersCount: 33, sellersCount: 11, unit: 'item' },
  { id: 'broccoli', name: 'Broccoli & Cauliflower', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=600&auto=format&fit=crop&q=80', buyersCount: 27, sellersCount: 8, unit: 'head' },
  { id: 'asparagus', name: 'Asparagus', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1515471209610-e3f150774a35?w=600&auto=format&fit=crop&q=80', buyersCount: 22, sellersCount: 6, unit: 'bunch' },

  // ── TOP FRUITS & BERRIES ──
  { id: 'avocados', name: 'Hass Avocados', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80', buyersCount: 55, sellersCount: 21, unit: 'bag' },
  { id: 'figs', name: 'Figs', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1601379327928-1fed57e437c6?w=600&auto=format&fit=crop&q=80', buyersCount: 38, sellersCount: 14, unit: 'basket' },
  { id: 'persimmons', name: 'Persimmons', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1604882737321-e693746f504d?w=600&auto=format&fit=crop&q=80', buyersCount: 34, sellersCount: 12, unit: 'bag' },
  { id: 'pomegranates', name: 'Pomegranates', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop&q=80', buyersCount: 29, sellersCount: 9, unit: 'item' },
  { id: 'peaches', name: 'Peaches & Nectarines', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1647413627916-24e680a133db?w=600&auto=format&fit=crop&q=80', buyersCount: 46, sellersCount: 17, unit: 'lb' },
  { id: 'plums', name: 'Plums', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=600&auto=format&fit=crop&q=80', buyersCount: 31, sellersCount: 10, unit: 'lb' },
  { id: 'cherries', name: 'Cherries', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?w=600&auto=format&fit=crop&q=80', buyersCount: 49, sellersCount: 15, unit: 'lb' },
  { id: 'apples', name: 'Apples', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600&auto=format&fit=crop&q=80', buyersCount: 51, sellersCount: 19, unit: 'bag' },
  { id: 'pears', name: 'Pears', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop&q=80', buyersCount: 28, sellersCount: 8, unit: 'bag' },
  { id: 'strawberries', name: 'Strawberries', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=600&auto=format&fit=crop&q=80', buyersCount: 62, sellersCount: 22, unit: 'flat' },
  { id: 'blueberries', name: 'Blueberries', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1498557850523-fd3d118b962e?w=600&auto=format&fit=crop&q=80', buyersCount: 54, sellersCount: 18, unit: 'pint' },
  { id: 'blackberries', name: 'Blackberries & Raspberries', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1577069861033-55d04ace4ed0?w=600&auto=format&fit=crop&q=80', buyersCount: 45, sellersCount: 14, unit: 'pint' },
  { id: 'watermelon', name: 'Watermelon & Melons', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&auto=format&fit=crop&q=80', buyersCount: 43, sellersCount: 14, unit: 'item' },
  { id: 'grapes', name: 'Grapes', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1537640538966-79f369143f8f?w=600&auto=format&fit=crop&q=80', buyersCount: 32, sellersCount: 9, unit: 'lb' },
  { id: 'mangoes', name: 'Mangoes', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&auto=format&fit=crop&q=80', buyersCount: 39, sellersCount: 10, unit: 'item' },
  { id: 'passionfruit', name: 'Passionfruit & Guavas', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1534531173927-aeb928d54385?w=600&auto=format&fit=crop&q=80', buyersCount: 24, sellersCount: 7, unit: 'item' },

  // ── HERBS ──
  { id: 'basil', name: 'Fresh Basil', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?w=600&auto=format&fit=crop&q=80', buyersCount: 45, sellersCount: 17, unit: 'bunch' },
  { id: 'mint', name: 'Fresh Mint', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=600&auto=format&fit=crop&q=80', buyersCount: 35, sellersCount: 13, unit: 'bunch' },
  { id: 'rosemary', name: 'Rosemary & Thyme', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1515586000433-45406d8e6662?w=600&auto=format&fit=crop&q=80', buyersCount: 38, sellersCount: 14, unit: 'bunch' },
  { id: 'cilantro', name: 'Parsley & Cilantro', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1588879460618-9249e7d947d1?w=600&auto=format&fit=crop&q=80', buyersCount: 42, sellersCount: 16, unit: 'bunch' },
  { id: 'oregano', name: 'Oregano & Sage', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?w=600&auto=format&fit=crop&q=80', buyersCount: 25, sellersCount: 8, unit: 'bunch' },
  { id: 'chives', name: 'Chives & Dill', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1588879460618-9249e7d947d1?w=600&auto=format&fit=crop&q=80', buyersCount: 20, sellersCount: 6, unit: 'bunch' },
  { id: 'lavender', name: 'Lavender', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1528183429752-a97d0bf99b5a?w=600&auto=format&fit=crop&q=80', buyersCount: 33, sellersCount: 10, unit: 'bundle' },

  // ── PLANTS & SEEDLINGS ──
  { id: 'veg_seedlings', name: 'Vegetable & Tomato Seedlings', category: 'seedlings', displayCategory: 'Plants & Seedlings', image: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=600&auto=format&fit=crop&q=80', buyersCount: 44, sellersCount: 16, unit: 'tray' },
  { id: 'herb_plants', name: 'Potted Herb Starter Plants', category: 'plants', displayCategory: 'Plants & Seedlings', image: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600&auto=format&fit=crop&q=80', buyersCount: 37, sellersCount: 14, unit: 'pot' },
  { id: 'berry_bushes', name: 'Berry Bushes & Strawberry Starters', category: 'plants', displayCategory: 'Plants & Seedlings', image: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=600&auto=format&fit=crop&q=80', buyersCount: 31, sellersCount: 9, unit: 'plant' },
  { id: 'fruit_trees', name: 'Fruit Tree Saplings (Citrus/Fig/Avocado)', category: 'plants', displayCategory: 'Plants & Seedlings', image: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=600&auto=format&fit=crop&q=80', buyersCount: 26, sellersCount: 7, unit: 'tree' },

  // ── SEEDS ──
  { id: 'heirloom_veg_seeds', name: 'Heirloom Vegetable Seeds', category: 'seeds', displayCategory: 'Seeds', image: 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?w=600&auto=format&fit=crop&q=80', buyersCount: 35, sellersCount: 12, unit: 'pack' },
  { id: 'herb_seeds', name: 'Herb & Medicinal Seeds', category: 'seeds', displayCategory: 'Seeds', image: 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?w=600&auto=format&fit=crop&q=80', buyersCount: 28, sellersCount: 9, unit: 'pack' },
  { id: 'wildflower_seeds', name: 'Wildflower & Pollinator Seeds', category: 'seeds', displayCategory: 'Seeds', image: 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?w=600&auto=format&fit=crop&q=80', buyersCount: 31, sellersCount: 10, unit: 'pack' },

  // ── HOMESTEAD BIRD EGGS ──
  { id: 'chicken_eggs', name: 'Pastured Chicken Eggs', category: 'eggs', displayCategory: 'Homestead Eggs', image: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=600&auto=format&fit=crop&q=80', buyersCount: 74, sellersCount: 26, unit: 'dozen' },
  { id: 'duck_eggs', name: 'Homestead Duck Eggs', category: 'eggs', displayCategory: 'Homestead Eggs', image: 'https://images.unsplash.com/photo-1569288052389-dac9b01c9c05?w=600&auto=format&fit=crop&q=80', buyersCount: 41, sellersCount: 15, unit: 'dozen' },
  { id: 'quail_eggs', name: 'Fresh Quail Eggs', category: 'eggs', displayCategory: 'Homestead Eggs', image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=600&auto=format&fit=crop&q=80', buyersCount: 33, sellersCount: 11, unit: 'carton' },
  { id: 'goose_eggs', name: 'Farm Goose Eggs', category: 'eggs', displayCategory: 'Homestead Eggs', image: 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=600&auto=format&fit=crop&q=80', buyersCount: 19, sellersCount: 6, unit: 'item' },
  { id: 'turkey_eggs', name: 'Heritage Turkey Eggs', category: 'eggs', displayCategory: 'Homestead Eggs', image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=600&auto=format&fit=crop&q=80', buyersCount: 16, sellersCount: 4, unit: 'half-dozen' },
]

type FilterCategory = 'all' | 'produce' | 'plants_seedlings' | 'seeds' | 'eggs'
type InterestType = 'buy' | 'sell'

interface SelectedInterest {
  item: ProduceItem
  type: InterestType
}

function InterestPageContent() {
  useReferralCapture()
  const searchParams = useSearchParams()
  const isStandalone = searchParams.get('mode') === 'standalone'
  const scope = searchParams.get('scope') as 'buy' | 'sell' | null

  const { refresh } = useBootstrap()

  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all')
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [selectedInterests, setSelectedInterests] = useState<SelectedInterest[]>([])
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [successBanner, setSuccessBanner] = useState(false)

  // Form State
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [zipInput, setZipInput] = useState('')
  const [zipcodes, setZipcodes] = useState<string[]>([])
  const [zipError, setZipError] = useState('')

  // Guest QuickSetup Auth State
  const [guestAuthStep, setGuestAuthStep] = useState<'auth' | 'otp' | 'completed'>('auth')
  const [otpEmail, setOtpEmail] = useState('')
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [tosChecked, setTosChecked] = useState(true)
  const [isProfileComplete, setIsProfileComplete] = useState(false)
  const [radius, setRadius] = useState(5)
  const [homeAddress, setHomeAddress] = useState('')
  const [addressFields, setAddressFields] = useState<AddressFields>(EMPTY_ADDRESS)
  const [isLocating, setIsLocating] = useState(false)
  const [showOptionalAddress, setShowOptionalAddress] = useState(false)
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null)
  const [fetchedCustomImage, setFetchedCustomImage] = useState<string>('')

  // Auto-fetch precise stock image from Wikimedia for custom queries
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setFetchedCustomImage('')
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(q)}&prop=pageimages&format=json&pithumbsize=600&origin=*`)
        const data = await res.json()
        if (cancelled) return
        const pages = data?.query?.pages
        if (pages) {
          const pageId = Object.keys(pages)[0]
          const thumb = pages[pageId]?.thumbnail?.source
          if (thumb) {
            setFetchedCustomImage(thumb)
            return
          }
        }
        setFetchedCustomImage('')
      } catch {
        if (!cancelled) setFetchedCustomImage('')
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  const handleUseCurrentLocation = async () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
          const data = await res.json()
          if (data && data.address) {
            const addr = data.address
            const street = [addr.house_number, addr.road].filter(Boolean).join(' ') || addr.suburb || ''
            const city = addr.city || addr.town || addr.village || ''
            const state = (addr.state || '').slice(0, 2).toUpperCase()
            const zip = addr.postcode || ''
            const newFields = { street, city, state, zip }
            setAddressFields(newFields)
            setHomeAddress(formatFullAddress(newFields))
            if (zip && !zipcodes.includes(zip)) {
              setZipcodes((prev) => [...prev, zip])
            }
          }
        } catch (err) {
          console.error('Reverse geocode failed:', err)
        } finally {
          setIsLocating(false)
        }
      },
      () => {
        setIsLocating(false)
        alert('Could not access location. Please check browser permissions.')
      }
    )
  }

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpEmail.trim()) {
      setOtpError('Please enter your email address')
      return
    }
    setOtpSending(true)
    setOtpError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({ email: otpEmail.trim() })
      if (error) {
        setOtpError(error.message)
      } else {
        setEmail(otpEmail.trim())
        setGuestAuthStep('otp')
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Failed to send verification code')
    } finally {
      setOtpSending(false)
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pastedData.length > 0) {
      const newDigits = ['', '', '', '', '', '']
      for (let i = 0; i < pastedData.length && i < 6; i++) {
        newDigits[i] = pastedData[i]
      }
      setOtpDigits(newDigits)
      const nextEmpty = Math.min(pastedData.length, 5)
      const nextInput = document.getElementById(`otp-digit-${nextEmpty}`)
      nextInput?.focus()
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otpDigits.join('')
    if (code.length < 6) {
      setOtpError('Please enter the 6-digit code sent to your email')
      return
    }
    setOtpVerifying(true)
    setOtpError('')
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.verifyOtp({
        email: otpEmail.trim(),
        token: code,
        type: 'email'
      })
      if (error) {
        setOtpError(error.message)
      } else if (data.user) {
        setUserId(data.user.id)
        setEmail(data.user.email || otpEmail.trim())
        setName(data.user.user_metadata?.full_name || '')
        setGuestAuthStep('completed')
        try {
          await refresh()
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Failed to verify code')
    } finally {
      setOtpVerifying(false)
    }
  }

  useEffect(() => {
    const supabase = createClient()
    const syncUser = async (user: any) => {
      if (user) {
        setUserId(user.id)
        setEmail(user.email || '')
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, zip_code, tos_accepted_at')
          .eq('id', user.id)
          .single()

        const fullName = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || ''
        if (fullName) setName(fullName)
        
        if (fullName && profile?.tos_accepted_at) {
          setIsProfileComplete(true)
        } else {
          setIsProfileComplete(false)
        }
        
        if (profile?.zip_code) {
          setZipcodes((prev) => {
            if (!prev.includes(profile.zip_code)) {
              return [...prev, profile.zip_code]
            }
            return prev
          })
        }
      } else {
        setUserId(null)
        setEmail('')
        setName('')
        setIsProfileComplete(false)
        setGuestAuthStep('auth')
      }
    }

    supabase.auth.getUser().then(({ data: { user } }: { data: { user: any } }) => syncUser(user))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      syncUser(session?.user || null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Auto-select produce item from ?q= query param
  const autoSelectedRef = React.useRef(false)
  useEffect(() => {
    if (autoSelectedRef.current) return
    const q = searchParams.get('q')
    if (!q) return

    const qLower = q.toLowerCase().trim()
    const match = EXHAUSTIVE_US_PRODUCE.find(item =>
      item.name.toLowerCase().includes(qLower) || qLower.includes(item.name.toLowerCase())
    )
    if (!match) return

    autoSelectedRef.current = true
    const interest: SelectedInterest = { item: match, type: scope || 'buy' }
    setSelectedInterests([interest])
  }, [searchParams, scope])

  // Filter produce items
  const filteredItems = useMemo(() => {
    return EXHAUSTIVE_US_PRODUCE.filter((item) => {
      let matchesCategory = false
      if (activeCategory === 'all') matchesCategory = true
      else if (activeCategory === 'produce') matchesCategory = item.category === 'produce'
      else if (activeCategory === 'plants_seedlings') matchesCategory = item.category === 'plants' || item.category === 'seedlings'
      else if (activeCategory === 'seeds') matchesCategory = item.category === 'seeds'
      else if (activeCategory === 'eggs') matchesCategory = item.category === 'eggs'

      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
      return matchesCategory && matchesSearch
    })
  }, [activeCategory, searchQuery])

  // Zipcode validation
  const handleAddZipcode = () => {
    const cleanZip = zipInput.trim()
    if (!/^\d{5}$/.test(cleanZip)) {
      setZipError('Please enter a valid 5-digit US zipcode (e.g. 94025)')
      return
    }
    if (zipcodes.includes(cleanZip)) {
      setZipError('Zipcode already added')
      return
    }
    setZipcodes([...zipcodes, cleanZip])
    setZipInput('')
    setZipError('')
  }

  const handleRemoveZipcode = (zipToRemove: string) => {
    setZipcodes(zipcodes.filter((z) => z !== zipToRemove))
  }

  // Handle selecting Buy / Sell interest
  const handleSelectInterest = (item: ProduceItem, type: InterestType) => {
    const existingIndex = selectedInterests.findIndex(
      (si) => si.item.id === item.id && si.type === type
    )
    let updated: SelectedInterest[] = []
    if (existingIndex >= 0) {
      updated = selectedInterests.filter((_, idx) => idx !== existingIndex)
    } else {
      updated = [...selectedInterests, { item, type }]
    }
    setSelectedInterests(updated)
  }

  const isSelected = (itemId: string, type: InterestType) => {
    return selectedInterests.some((si) => si.item.id === itemId && si.type === type)
  }

  const handleSubmitInterest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setZipError('')

    let finalZipcodes = [...zipcodes]
    if (zipInput.trim() && /^\d{5}$/.test(zipInput.trim()) && !finalZipcodes.includes(zipInput.trim())) {
      finalZipcodes.push(zipInput.trim())
    }
    if (addressFields.zip && /^\d{5}$/.test(addressFields.zip.trim()) && !finalZipcodes.includes(addressFields.zip.trim())) {
      finalZipcodes.push(addressFields.zip.trim())
    }

    if (finalZipcodes.length === 0) {
      setZipError('Please add a 5-digit zipcode or home address before saving')
      return
    }

    setIsSubmitting(true)

    try {
      const referralData = getReferralData()
      const submitPayload = {
          name,
          email,
          phone: null,
          zipcodes: finalZipcodes,
          interests: selectedInterests.map((si) => ({
            produce_name: si.item.name,
            interest_type: si.type,
            category: si.item.category,
          })),
          preference_pickup: true,
          preference_delivery: true,
          radius_miles: radius,
          home_address: homeAddress,
          accepts_email: true,
          accepts_sms: false,
          accepts_push: true,
          password: undefined,
          user_id: userId,
          ...referralData,
        }
      const resp = await fetch('/api/interest/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitPayload),
      })
      const respData = await resp.json()

      if (userId) {
        try {
          const supabase = createClient()
          const updates: Record<string, any> = {
            zip_code: finalZipcodes[0],
          }
          if (name.trim()) updates.full_name = name.trim()
          if (tosChecked) updates.tos_accepted_at = new Date().toISOString()
          if (name.trim() && tosChecked) updates.profile_completed_at = new Date().toISOString()
          await supabase.from('profiles').update(updates).eq('id', userId)
          setIsProfileComplete(true)
          try { await refresh() } catch {}
          if (name.trim()) {
            window.dispatchEvent(new CustomEvent('profile-updated', { detail: { fullName: name.trim() } }))
          }
        } catch (profileErr) {
          console.error('Failed to update profile:', profileErr)
        }
      }

      setIsModalOpen(false)
      setSuccessBanner(true)
      setSelectedInterests([])
      window.scrollTo(0, 0)
    } catch {
      setZipError('Failed to save interests. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveClick = () => {
    if (!userId) {
      setIsModalOpen(true)
      setGuestAuthStep('auth')
    } else {
      setIsModalOpen(true)
      setGuestAuthStep('completed')
    }
  }

  const showBuy = scope === 'buy' || scope === null
  const showSell = scope === 'sell' || scope === null

  const headerTitle = scope === 'sell' 
    ? "Select what you grow — we'll notify you when nearby buyers are looking"
    : scope === 'buy' 
    ? "Select what you need — we'll notify you when nearby growers list it"
    : "Set up your produce notifications"

  return (
    <div style={{ ...styles.pageRoot, paddingTop: isStandalone ? 0 : '64px' }}>
      {/* Official App Navbar Header (renders unless mode=standalone query param is passed) */}
      {!isStandalone ? (
        <Navbar />
      ) : (
        <header style={styles.navHeader}>
          <div style={styles.navContainer}>
            <Link href="/market" style={styles.logoLink}>
              <span style={{ fontSize: '24px', marginRight: '6px' }}>🌱</span>
              <span style={styles.logoText}>CasaGrown Market</span>
            </Link>
            <Link href="/market" style={styles.browseBtn}>
              Browse Live Market →
            </Link>
          </div>
        </header>
      )}

      {successBanner && (
        <div style={styles.successBanner}>
          ✅ Interests saved!{' '}
          <Link href="/my-interests" style={styles.successLink}>
            View them in My Interests →
          </Link>
        </div>
      )}

      {/* Header Section */}
      <section style={styles.headerSection}>
        <div style={styles.headerContent}>
          <h1 style={styles.headerTitle}>{headerTitle}</h1>
          <div style={{ marginTop: '12px' }}>
            <Link href="/my-interests" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#ffffff', color: '#15803d', border: '1.5px solid #86efac', padding: '8px 16px', borderRadius: '9999px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              📋 Manage My Interests →
            </Link>
          </div>
        </div>
      </section>

      {/* Produce Search & Category Filter Sub-Bar */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', padding: '12px 16px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto 10px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Search produce (e.g. Avocado, Figs, Tomatoes)..."
            style={{ ...styles.searchInput, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <style>{`
          .hide-scrollbar::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
          .hide-scrollbar {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
          }
          .category-scroll-wrapper {
            position: relative;
          }
          .category-scroll-wrapper::after {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: 28px;
            background: linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,0.95));
            pointer-events: none;
          }
          .bottom-sticky-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background-color: #ffffff;
            border-top: 1px solid #e5e7eb;
            padding: 14px 24px;
            box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
            z-index: 200;
          }
          @media (max-width: 768px) {
            .bottom-sticky-bar {
              bottom: 60px;
            }
          }
        `}</style>

        <div className="category-scroll-wrapper" style={styles.categoryBarContainer}>
          <div style={styles.categoryBar} className="hide-scrollbar">
            {[
              { key: 'all', label: 'All Categories' },
              { key: 'produce', label: 'Fresh Produce' },
              { key: 'plants_seedlings', label: 'Plants & Seedlings' },
              { key: 'seeds', label: 'Seeds' },
              { key: 'eggs', label: 'Homestead Eggs' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveCategory(tab.key as FilterCategory)}
                style={{
                  ...styles.categoryTab,
                  ...(activeCategory === tab.key ? styles.categoryTabActive : {}),
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <main style={styles.gridContainer}>
        {(() => {
          const trimmedSearch = searchQuery.trim()
          const exactMatchExists = trimmedSearch ? EXHAUSTIVE_US_PRODUCE.some((item) => item.name.toLowerCase() === trimmedSearch.toLowerCase()) : true
          const customItem: ProduceItem | null = (trimmedSearch.length >= 2 && !exactMatchExists) ? {
            id: `custom_${trimmedSearch.toLowerCase().replace(/\s+/g, '_')}`,
            name: trimmedSearch.charAt(0).toUpperCase() + trimmedSearch.slice(1),
            category: 'produce',
            displayCategory: 'Custom Produce',
            image: fetchedCustomImage || '/images/produce_placeholder.jpg',
            buyersCount: 0,
            sellersCount: 0,
            unit: 'item',
          } : null

          const itemsToRender = customItem ? [customItem, ...filteredItems] : filteredItems

          return (
            <>
              {itemsToRender.length === 0 && (
                <div style={styles.noResultsBox}>
                  🔍 No produce found matching &quot;{searchQuery}&quot;. Try typing a produce name to add it as a custom interest!
                </div>
              )}

              <div style={styles.produceGrid}>
                {itemsToRender.map((item) => {
                  const buyingSelected = isSelected(item.id, 'buy')
                  const sellingSelected = isSelected(item.id, 'sell')
                  const isCardSelected = buyingSelected || sellingSelected
                  const isCustom = item.id.startsWith('custom_')

                  return (
                    <div 
                      key={item.id} 
                      style={{
                        ...styles.produceCard,
                        borderColor: isCardSelected ? '#16a34a' : isCustom ? '#86efac' : '#e5e7eb',
                        borderWidth: isCardSelected ? '2px' : '1px',
                        backgroundColor: isCustom ? '#f0fdf4' : '#ffffff'
                      }}
                    >
                      <div style={styles.imageWrapper}>
                        <img
                          src={item.image || '/images/produce_placeholder.jpg'}
                          alt={item.name}
                          width={320}
                          height={160}
                          style={styles.cardImage}
                          onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement
                            target.src = '/images/produce_placeholder.jpg'
                          }}
                        />
                      </div>

                      <div style={styles.cardContent}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <h3 style={styles.cardTitle}>{item.name}</h3>
                          {isCustom && (
                            <span style={{ fontSize: '10px', backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              CUSTOM
                            </span>
                          )}
                        </div>
                        <div style={styles.cardCategory}>
                          {item.displayCategory.toUpperCase()}
                        </div>

                        <div style={styles.cardCheckboxes}>
                          {showSell && (
                            <label style={styles.checkboxLabel}>
                              <input
                                type="checkbox"
                                checked={sellingSelected}
                                onChange={() => handleSelectInterest(item, 'sell')}
                                style={styles.checkboxInput}
                              />
                              I have this
                            </label>
                          )}
                          {showBuy && (
                            <label style={styles.checkboxLabel}>
                              <input
                                type="checkbox"
                                checked={buyingSelected}
                                onChange={() => handleSelectInterest(item, 'buy')}
                                style={styles.checkboxInput}
                              />
                              I want this
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )
        })()}
      </main>

      {/* Bottom Sticky Bar */}
      {selectedInterests.length > 0 && (
        <div className="bottom-sticky-bar">
          <div style={styles.bottomBarContent}>
            <div style={styles.bottomBarLeft}>
              <span style={styles.selectedCountBadge}>{selectedInterests.length}</span> items selected
            </div>

            <div style={styles.bottomBarRight}>
              <button onClick={handleSaveClick} style={styles.btnSave}>
                Save & Get Notified →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simplified Auth Modal */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Save Your Interests</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Not Logged In - OAuth & OTP */}
              {!userId && guestAuthStep === 'auth' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const supabase = createClient()
                        await supabase.auth.signInWithOAuth({
                          provider: 'google',
                          options: { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/interest` : undefined }
                        })
                      } catch (err: any) {
                        setOtpError(err?.message || 'Google sign in failed')
                      }
                    }}
                    style={styles.oauthBtn}
                  >
                    <span style={{ fontSize: '18px' }}>🌐</span> Continue with Google
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const supabase = createClient()
                        await supabase.auth.signInWithOAuth({
                          provider: 'apple',
                          options: { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/interest` : undefined }
                        })
                      } catch (err: any) {
                        setOtpError(err?.message || 'Apple sign in failed')
                      }
                    }}
                    style={styles.oauthBtn}
                  >
                    <span style={{ fontSize: '18px' }}></span> Continue with Apple
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0', gap: '10px' }}>
                    <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
                    <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: 500 }}>or</span>
                    <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
                  </div>

                  <form onSubmit={handleSendOtp}>
                    <input
                      type="email"
                      required
                      value={otpEmail}
                      onChange={(e) => {
                        setOtpEmail(e.target.value)
                        setOtpError('')
                      }}
                      placeholder="Email Address"
                      style={{ ...styles.input, marginBottom: '12px' }}
                    />
                    {otpError && <div style={styles.errorText}>{otpError}</div>}
                    <button
                      type="submit"
                      disabled={otpSending || !otpEmail.trim()}
                      style={{ ...styles.btnPrimary, width: '100%', opacity: otpSending || !otpEmail.trim() ? 0.5 : 1 }}
                    >
                      {otpSending ? 'Sending code...' : 'Continue with Email →'}
                    </button>
                  </form>
                </div>
              )}

              {/* OTP Verification */}
              {!userId && guestAuthStep === 'otp' && (
                <form onSubmit={handleVerifyOtp} style={{ textAlign: 'center' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Verify Code</h3>
                  <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>Sent to {otpEmail}</p>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }} onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        id={`otp-digit-${idx}`}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '')
                          const newDigits = [...otpDigits]
                          newDigits[idx] = val
                          setOtpDigits(newDigits)
                          if (val && idx < 5) {
                            document.getElementById(`otp-digit-${idx + 1}`)?.focus()
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
                            document.getElementById(`otp-digit-${idx - 1}`)?.focus()
                          }
                        }}
                        style={styles.otpInput}
                      />
                    ))}
                  </div>

                  {otpError && <div style={styles.errorText}>{otpError}</div>}

                  <button
                    type="submit"
                    disabled={otpVerifying || otpDigits.join('').length < 6}
                    style={{ ...styles.btnPrimary, width: '100%' }}
                  >
                    {otpVerifying ? 'Verifying...' : 'Verify Code'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGuestAuthStep('auth')
                      setOtpError('')
                    }}
                    style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer', marginTop: '16px' }}
                  >
                    Use a different method
                  </button>
                </form>
              )}

              {/* Post-Auth Form Completion */}
              {(userId || guestAuthStep === 'completed') && (
                <form onSubmit={handleSubmitInterest}>
                  {!isProfileComplete && (
                    <>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={styles.label}>Full Name *</label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Jane Smith"
                          style={styles.input}
                        />
                      </div>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={tosChecked}
                            onChange={(e) => setTosChecked(e.target.checked)}
                            required
                          />
                          <span>
                            I agree to{' '}
                            <button
                              type="button"
                              onClick={() => setLegalModal('terms')}
                              style={{ color: '#16a34a', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
                            >
                              Terms of Service
                            </button>{' '}
                            &{' '}
                            <button
                              type="button"
                              onClick={() => setLegalModal('privacy')}
                              style={{ color: '#16a34a', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
                            >
                              Privacy Policy
                            </button>
                          </span>
                        </label>
                      </div>
                    </>
                  )}

                  {/* Zipcode Input */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={styles.label}>Zipcode(s) *</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        maxLength={5}
                        value={zipInput}
                        onChange={(e) => {
                          setZipInput(e.target.value)
                          setZipError('')
                        }}
                        placeholder="e.g. 94025"
                        style={{ ...styles.input, flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={handleAddZipcode}
                        style={{ padding: '8px 16px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        + Add
                      </button>
                    </div>
                    {zipcodes.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {zipcodes.map((z) => (
                          <span key={z} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '9999px', fontSize: '13px', fontWeight: 600 }}>
                            📍 {z} <button type="button" onClick={() => handleRemoveZipcode(z)} style={{ background: 'none', border: 'none', color: '#15803d', cursor: 'pointer', fontWeight: 700 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Collapsible Home Address Section */}
                  <div style={{ marginBottom: '16px' }}>
                    <button
                      type="button"
                      onClick={() => setShowOptionalAddress(!showOptionalAddress)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#15803d',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: 0,
                        marginBottom: showOptionalAddress ? '12px' : '0',
                      }}
                    >
                      {showOptionalAddress
                        ? '➖ Hide Optional Home Address'
                        : '➕ Narrow Scope with Address & Exact Radius (Optional)'}
                    </button>

                    {showOptionalAddress && (
                      <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                        <label style={{ ...styles.label, marginBottom: '8px' }}>
                          Home Address (Optional — for exact distance calculation)
                        </label>
                        <AddressInput
                          value={addressFields}
                          onChange={(val: AddressFields) => {
                            setAddressFields(val)
                            setHomeAddress(formatFullAddress(val))
                            if (val.zip && /^\d{5}$/.test(val.zip.trim()) && !zipcodes.includes(val.zip.trim())) {
                              setZipcodes((prev) => [...prev, val.zip.trim()])
                            }
                          }}
                          showPrivacyNote={true}
                        />
                        <button
                          type="button"
                          onClick={handleUseCurrentLocation}
                          disabled={isLocating}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#ffffff',
                            color: '#15803d',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: isLocating ? 'not-allowed' : 'pointer',
                            marginTop: '10px',
                            marginBottom: '14px',
                          }}
                        >
                          {isLocating ? '⏳ Locating...' : '📍 Use my current location'}
                        </button>

                        {/* Radius Slider */}
                        <div style={{ marginTop: '12px' }}>
                          <label style={styles.label}>Matching Radius: <strong>{radius} miles</strong></label>
                          <input
                            type="range"
                            min={1}
                            max={50}
                            value={radius}
                            onChange={(e) => setRadius(Number(e.target.value))}
                            style={{ width: '100%', accentColor: '#16a34a' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280' }}>
                            <span>1 mi</span><span>5 mi</span><span>15 mi</span><span>50 mi</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {zipError && <div style={styles.errorText}>{zipError}</div>}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{ ...styles.btnPrimary, width: '100%', marginTop: '8px' }}
                  >
                    {isSubmitting ? 'Saving...' : 'Save & Get Notified'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inline Legal Modal Overlay */}
      {legalModal && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalCard, maxWidth: '520px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#14532d' }}>
                {legalModal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#9ca3af', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
              {legalModal === 'terms' ? (
                <div>
                  <p style={{ marginBottom: '12px' }}><strong>1. Acceptable Use:</strong> CasaGrown provides a community produce matching and listing service for neighborhood garden sharing and local produce exchange.</p>
                  <p style={{ marginBottom: '12px' }}><strong>2. Account & Conduct:</strong> Users are responsible for maintaining accurate contact details and treating community members with respect.</p>
                  <p style={{ marginBottom: '12px' }}><strong>3. Safety & Produce Quality:</strong> All produce shared or sold is provided directly by community members. Users should practice standard produce handling and food safety.</p>
                </div>
              ) : (
                <div>
                  <p style={{ marginBottom: '12px' }}><strong>1. Privacy Protection:</strong> We protect your home address. Your exact address is never displayed publicly to shoppers or prospective buyers.</p>
                  <p style={{ marginBottom: '12px' }}><strong>2. Data Usage:</strong> Zipcodes and location data are used solely to match you with nearby growers, buyers, and local produce listings.</p>
                  <p style={{ marginBottom: '12px' }}><strong>3. Communications:</strong> We send notifications regarding produce matches and local garden activity based on your chosen preferences.</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setLegalModal(null)}
              style={{ ...styles.btnPrimary, width: '100%', marginTop: '16px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (renders when inside main app) */}
      {!isStandalone && <BottomNav />}
    </div>
  )
}

export default function InterestPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }} />}>
      <ErrorToastProvider>
        <BootstrapProvider>
          <MarketProvider>
            <CartProvider>
              <QuickSetupProvider>
                <InterestPageContent />
              </QuickSetupProvider>
            </CartProvider>
          </MarketProvider>
        </BootstrapProvider>
      </ErrorToastProvider>
    </Suspense>
  )
}

const styles: Record<string, React.CSSProperties> = {
  pageRoot: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    color: '#1f2937',
    paddingBottom: '100px', // Extra padding for sticky bar
  },
  navHeader: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    position: 'sticky',
    top: 0,
    zIndex: 40,
  },
  navContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '14px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  logoLink: {
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
    color: '#16a34a',
    fontWeight: 700,
  },
  logoText: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#14532d',
  },
  browseBtn: {
    color: '#16a34a',
    fontWeight: 600,
    textDecoration: 'none',
    fontSize: '14px',
  },
  successBanner: {
    backgroundColor: '#dcfce7',
    borderBottom: '1px solid #bbf7d0',
    padding: '12px 16px',
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: 600,
    color: '#166534',
  },
  successLink: {
    color: '#15803d',
    textDecoration: 'underline',
    marginLeft: '6px',
  },
  headerSection: {
    backgroundColor: '#f0fdf4',
    borderBottom: '1px solid #bbf7d0',
    padding: '32px 24px',
    textAlign: 'center',
  },
  headerContent: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  headerTitle: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#14532d',
    lineHeight: 1.25,
    margin: 0,
  },
  searchInput: {
    width: '100%',
    padding: '10px 16px',
    borderRadius: '9999px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    outline: 'none',
  },
  categoryBarContainer: {
    borderTop: '1px solid #f3f4f6',
    backgroundColor: '#ffffff',
    padding: '8px 24px',
  },
  categoryBar: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  categoryTab: {
    border: 'none',
    backgroundColor: '#f3f4f6',
    color: '#4b5563',
    padding: '6px 14px',
    borderRadius: '9999px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  categoryTabActive: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
    fontWeight: 600,
  },
  gridContainer: {
    maxWidth: '1200px',
    margin: '28px auto',
    padding: '0 24px',
  },
  noResultsBox: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '32px',
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '15px',
  },
  produceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '20px',
  },
  produceCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'all 0.2s ease',
  },
  imageWrapper: {
    position: 'relative',
    height: '160px',
    backgroundColor: '#f3f4f6',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  cardContent: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#1f2937',
    margin: '0 0 4px 0',
  },
  cardCategory: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '12px',
  },
  cardCheckboxes: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: 'auto',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    cursor: 'pointer',
    backgroundColor: '#f9fafb',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  checkboxInput: {
    width: '16px',
    height: '16px',
    accentColor: '#16a34a',
    cursor: 'pointer',
  },
  bottomStickyBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e5e7eb',
    padding: '16px 24px',
    boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)',
    zIndex: 50,
  },
  bottomBarContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  bottomBarLeft: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  selectedCountBadge: {
    backgroundColor: '#16a34a',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '12px',
  },
  bottomBarRight: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  btnSave: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    padding: '10px 24px',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)',
    whiteSpace: 'nowrap',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '16px',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
    overflow: 'hidden',
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 700,
    margin: 0,
  },
  modalCloseBtn: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '4px',
  },
  modalBody: {
    padding: '20px',
  },
  oauthBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '11px 16px',
    borderRadius: '12px',
    border: '1.5px solid #d1d5db',
    backgroundColor: 'white',
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    cursor: 'pointer',
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    borderRadius: '10px',
    border: '1.5px solid #d1d5db',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '6px',
  },
  btnPrimary: {
    padding: '12px 20px',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: 'white',
    cursor: 'pointer',
  },
  errorText: {
    color: '#ef4444',
    fontSize: '13px',
    marginTop: '4px',
    marginBottom: '8px',
  },
  otpInput: {
    width: '40px',
    height: '46px',
    fontSize: '20px',
    fontWeight: 700,
    textAlign: 'center',
    borderRadius: '8px',
    border: '1.5px solid #d1d5db',
    backgroundColor: '#f9fafb',
  },
}
