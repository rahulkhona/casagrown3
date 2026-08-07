'use client'

import React, { useState, useMemo, useEffect, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams, useRouter } from 'next/navigation'
import { useReferralCapture, getReferralData } from '../../../lib/useReferralCapture'
import { createClient } from '../../../lib/supabase'
import { trackMetaLead } from '../../../lib/crm-analytics'
import { useBootstrap } from '../../../lib/useBootstrap'
import { useQuickSetup } from '../../../lib/useQuickSetup'
import AddressInput from '../../components/AddressInput'
import { type AddressFields, formatFullAddress, EMPTY_ADDRESS } from '../../../lib/address'
import { EXHAUSTIVE_US_PRODUCE, getProduceImage, type ProduceItem } from '../../../lib/produceCatalog'
import { checkTextForViolations } from '../../../lib/moderation'
import SocialShareModal from '../../components/SocialShareModal'

type FilterCategory = 'all' | 'produce' | 'plants_seedlings' | 'seeds' | 'eggs'
type InterestType = 'buy' | 'sell'

interface SelectedInterest {
  item: ProduceItem
  type: InterestType
}

function InterestPageContent() {
  useReferralCapture()
  const searchParams = useSearchParams()
  const router = useRouter()
  const isStandalone = searchParams.get('mode') === 'standalone'
  const scope = searchParams.get('scope') as 'buy' | 'sell' | null

  const { user, refresh } = useBootstrap()
  const { requireAuth } = useQuickSetup()
  const userId = user?.id || null

  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all')
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [selectedInterests, setSelectedInterests] = useState<SelectedInterest[]>([])
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [successBanner, setSuccessBanner] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [savedShareInterests, setSavedShareInterests] = useState<string[]>([])
  const [savedShareScope, setSavedShareScope] = useState<'buy' | 'sell'>('buy')
  const [userInterestCount, setUserInterestCount] = useState<number | null>(null)
  const [savedInterestKeys, setSavedInterestKeys] = useState<Set<string>>(new Set())

  // Custom Interest Modal state
  const [customModalOpen, setCustomModalOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customNameError, setCustomNameError] = useState('')
  const [customCandidates, setCustomCandidates] = useState<string[]>([])
  const [customSelectedImage, setCustomSelectedImage] = useState<string>('')
  const [customSearching, setCustomSearching] = useState(false)
  const [customUploading, setCustomUploading] = useState(false)
  const [customAdding, setCustomAdding] = useState(false)
  const [customAddError, setCustomAddError] = useState('')
  const [customUploadPreview, setCustomUploadPreview] = useState<string>('')
  const [customUploadFile, setCustomUploadFile] = useState<File | null>(null)
  const [customIntent, setCustomIntent] = useState<'buy' | 'sell'>('buy')
  const [showWebCameraModal, setShowWebCameraModal] = useState(false)
  const customSearchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Form State — pre-fill from URL params (coming from lead magnet wizards)
  const [name, setName] = useState(searchParams.get('name') || '')
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [zipInput, setZipInput] = useState(searchParams.get('zipcode') || '')
  const [zipcodes, setZipcodes] = useState<string[]>(searchParams.get('zipcode') ? [searchParams.get('zipcode')!] : [])
  const [zipError, setZipError] = useState('')

  // Guest QuickSetup Auth State
  const [guestAuthStep, setGuestAuthStep] = useState<'zip' | 'auth' | 'otp' | 'completed'>('auth')
  const [otpEmail, setOtpEmail] = useState(searchParams.get('email') || '')
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

  // Multi-stage stock image resolution for raw user keywords
  useEffect(() => {
    const rawQ = searchQuery.trim()
    if (rawQ.length < 2) {
      setFetchedCustomImage('')
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        // Stage 1 & 2: Direct title query with category inspection
        const qLower = rawQ.toLowerCase()
        let primaryTitle = rawQ
        if (qLower.includes('egg') && !qLower.endsWith('egg') && !qLower.endsWith('eggs')) {
          primaryTitle = `${rawQ} egg`
        } else if (qLower.includes('honey') && !qLower.includes('honey')) {
          primaryTitle = `${rawQ} honey`
        }

        const nonProduceCatPatterns = [/film/i, /movie/i, /director/i, /actor/i, /birth/i, /people/i, /biography/i, /surname/i, /politician/i, /police/i, /scandal/i, /football/i, /sports/i, /stadium/i, /company/i, /album/i, /song/i, /band/i, /television/i, /series/i, /novel/i, /game/i, /district/i, /river/i]

        let res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(primaryTitle)}&redirects=1&prop=categories|pageimages&format=json&pithumbsize=600&origin=*`)
        let data = await res.json()
        if (cancelled) return

        let pages = data?.query?.pages
        if (pages) {
          const pageId = Object.keys(pages)[0]
          if (pageId && pageId !== '-1') {
            const page = pages[pageId]
            const categories: any[] = page?.categories || []
            const isNonFood = categories.some((c: any) => nonProduceCatPatterns.some(p => p.test(c.title || '')))
            
            if (!isNonFood) {
              const thumb = page?.thumbnail?.source
              if (thumb) {
                setFetchedCustomImage(thumb)
                return
              }
            }
          }
        }

        // Stage 3: Default stock placeholder graphic (reject non-food matches)
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

  const [communityItems, setCommunityItems] = useState<ProduceItem[]>([])

  // Dynamically hydrate community-added items (e.g. Chickoo) from community_produce_catalog
  useEffect(() => {
    const fetchCommunityItems = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('community_produce_catalog')
          .select('id, name, category, image')
          .limit(200)

        if (data && data.length > 0) {
          const newItems: ProduceItem[] = []
          const presetNames = new Set(EXHAUSTIVE_US_PRODUCE.map((p) => p.name.toLowerCase()))
          const presetIds = new Set(EXHAUSTIVE_US_PRODUCE.map((p) => p.id.toLowerCase()))

          for (const row of data) {
            if (!row.name || presetNames.has(row.name.toLowerCase())) continue
            const rowId = (row.id || `community_${row.name.toLowerCase().replace(/\s+/g, '_')}`).toLowerCase()
            if (presetIds.has(rowId)) continue

            newItems.push({
              id: rowId,
              name: row.name,
              category: (row.category as any) || 'produce',
              displayCategory: 'Community Item',
              image: row.image || '/images/produce_placeholder.jpg',
              buyersCount: 1,
              sellersCount: 0,
              unit: 'item',
            })
          }
          setCommunityItems(newItems)
        }
      } catch {
        // Ignore fetch errors
      }
    }
    fetchCommunityItems()
  }, [])

  const [isSubmitting, setIsSubmitting] = useState(false)

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
        setEmail(data.user.email || otpEmail.trim())
        setName(data.user.user_metadata?.full_name || '')
        try {
          await refresh()
        } catch {
          // ignore
        }
        // Auto-submit interests after successful OTP login
        setTimeout(() => {
          handleSubmitInterest()
        }, 100)
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Failed to verify code')
    } finally {
      setOtpVerifying(false)
    }
  }

  useEffect(() => {
    const supabase = createClient()
    const syncUserData = async () => {
      if (user) {
        setEmail(user.email || '')
        
        const { data: dbInterests } = await supabase
          .from('crm_produce_interests')
          .select('produce_name, interest_type')
          .eq('user_id', user.id)

        if (dbInterests) {
          setUserInterestCount(dbInterests.length)
          const savedKeys = new Set<string>(dbInterests.map((i: any) => `${i.produce_name.toLowerCase()}_${i.interest_type}`))
          setSavedInterestKeys(savedKeys)

          // Do not treat already-saved interests as pending draft selections
          setSelectedInterests((prev) =>
            prev.filter((si) => !savedKeys.has(`${si.item.name.toLowerCase()}_${si.type}`))
          )
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, zip_code, tos_accepted_at')
          .eq('id', user.id)
          .single()

        const fullName = profile?.full_name || ''
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
        setEmail('')
        setName('')
        setIsProfileComplete(false)
      }
    }

    syncUserData()
  }, [user])

  // Auto-select produce item from ?produce= or ?items= or ?q= query param
  const autoSelectedRef = React.useRef(false)
  useEffect(() => {
    if (autoSelectedRef.current) return
    const rawParam = searchParams.get('produce') || searchParams.get('items') || searchParams.get('q')
    if (!rawParam) return

    // Clean quotes, lower-case, and split by comma
    const cleanParam = rawParam.replace(/^["']|["']$/g, '').trim()
    const itemNames = cleanParam.split(',').map(s => s.replace(/^["']|["']$/g, '').trim()).filter(Boolean)
    if (itemNames.length === 0) return

    const fullCatalog = [...EXHAUSTIVE_US_PRODUCE, ...communityItems]
    const matches: SelectedInterest[] = []

    for (const rawName of itemNames) {
      const name = rawName.toLowerCase()
      let match = fullCatalog.find(item =>
        item.name.toLowerCase() === name ||
        item.name.toLowerCase().includes(name) ||
        name.includes(item.name.toLowerCase())
      )

      if (!match) {
        // Fallback custom produce item if not found in preset catalog
        const titleCaseName = rawName.charAt(0).toUpperCase() + rawName.slice(1)
        match = {
          id: `custom_${name.replace(/[^a-z0-9]/g, '_')}`,
          name: titleCaseName,
          category: 'produce',
          displayCategory: 'Fresh Produce',
          image: getProduceImage(rawName),
          buyersCount: 0,
          sellersCount: 0,
          unit: 'item'
        }
      }

      if (match && !matches.some(m => m.item.id === match.id)) {
        matches.push({ item: match, type: scope || 'buy' })
      }
    }

    const newMatches = matches.filter(
      (m) => !savedInterestKeys.has(`${m.item.name.toLowerCase()}_${m.type}`)
    )

    if (newMatches.length > 0) {
      autoSelectedRef.current = true
      setSelectedInterests(newMatches)
      // Do NOT open modal here — userId may not be resolved yet (bootstrap race).
      // Logged-in users: the auto-save effect below will handle it.
      // Guest users: they click Save & Get Notified themselves.
    }
  }, [searchParams, scope, communityItems, savedInterestKeys])

  // Auto-save for logged-in users arriving from sell/nutrition wizard.
  // Detects: email + zipcode + produce all present in URL (written by sell/nutrition result page).
  // Fires once when userId becomes available (bootstrap may be slow).
  const autoSavedFromWizardRef = React.useRef(false)
  useEffect(() => {
    if (autoSavedFromWizardRef.current || !userId) return
    const hasEmail = !!searchParams.get('email')
    const hasZip = !!searchParams.get('zipcode')
    const hasProduce = !!(searchParams.get('produce') || searchParams.get('items'))
    if (!hasEmail || !hasZip || !hasProduce) return
    // All wizard params present — auto-save the pre-selected interests + zipcode silently
    autoSavedFromWizardRef.current = true
    // Give auto-select effect a tick to populate selectedInterests
    setTimeout(() => {
      handleSubmitInterest()
    }, 50)
  }, [userId, searchParams])

  // Restore interest draft from localStorage after OAuth redirect.
  // When user selected items, entered zipcode, clicked OAuth, and returned logged in,
  // re-select those items, restore zipcodes, and save automatically to database.
  const draftRestoredRef = React.useRef(false)
  useEffect(() => {
    if (draftRestoredRef.current || !userId) return
    try {
      const raw = localStorage.getItem('casagrown_interest_draft')
      if (!raw) return
      const draft = JSON.parse(raw)
      localStorage.removeItem('casagrown_interest_draft')
      draftRestoredRef.current = true

      if (draft.selectedInterests?.length > 0) {
        const fullCatalog = [...EXHAUSTIVE_US_PRODUCE, ...communityItems]
        const restored: SelectedInterest[] = []
        for (const item of draft.selectedInterests) {
          const match = fullCatalog.find(c => c.name.toLowerCase() === item.name.toLowerCase())
          if (match && !savedInterestKeys.has(`${match.name.toLowerCase()}_${item.type}`)) {
            restored.push({ item: match, type: item.type })
          }
        }
        if (restored.length > 0) {
          setSelectedInterests(restored)
          const restoredZips = draft.zipcodes || []
          if (restoredZips.length > 0) {
            setZipcodes(restoredZips)
          }
          handleSubmitInterest(undefined, restored, restoredZips)
        }
      }
    } catch {}
  }, [userId, communityItems, savedInterestKeys])

  // Filter produce items purely by search query (combining top 100 preset + community added items)
  const filteredItems = useMemo(() => {
    const fullCatalog = [...EXHAUSTIVE_US_PRODUCE, ...communityItems]
    const q = searchQuery.toLowerCase().trim()
    if (!q) return fullCatalog
    return fullCatalog.filter((item) => item.name.toLowerCase().includes(q))
  }, [searchQuery, communityItems])

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

  const handleSubmitInterest = async (
    e?: React.FormEvent,
    overrideInterests?: SelectedInterest[],
    overrideZipcodes?: string[]
  ) => {
    if (e) e.preventDefault()
    setZipError('')

    const activeInterests = overrideInterests || selectedInterests
    let finalZipcodes = overrideZipcodes ? [...overrideZipcodes] : [...zipcodes]
    if (!overrideZipcodes) {
      if (zipInput.trim() && /^\d{5}$/.test(zipInput.trim()) && !finalZipcodes.includes(zipInput.trim())) {
        finalZipcodes.push(zipInput.trim())
      }
      if (addressFields.zip && /^\d{5}$/.test(addressFields.zip.trim()) && !finalZipcodes.includes(addressFields.zip.trim())) {
        finalZipcodes.push(addressFields.zip.trim())
      }
    }

    if (finalZipcodes.length === 0) {
      setZipError('Please add a 5-digit zipcode or home address before saving')
      return
    }

    // IF USER IS NOT LOGGED IN, OPEN QUICKSETUP MODAL!
    if (!userId) {
      try {
        const draft = {
          scope,
          selectedInterests: activeInterests.map(si => ({ name: si.item.name, type: si.type })),
          zipcodes: finalZipcodes,
          name,
          email,
        }
        localStorage.setItem('casagrown_interest_draft', JSON.stringify(draft))
      } catch {}
      requireAuth({
        trigger: 'interest_save',
        redirectTo: '/interest?scope=' + (scope || 'buy'),
        onReady: () => {
          handleSubmitInterest(undefined, activeInterests, finalZipcodes)
        }
      })
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const submitEmail = email || user?.email || ''
      const submitUserId = userId || user?.id || null

      const referralData = getReferralData()
      const sourceUrlFromParam = searchParams.get('source_url') || searchParams.get('source') || (scope === 'sell' ? '/sell' : scope === 'buy' ? '/check-nutrition-loss' : '/interest')

      const submitPayload = {
          name: name || user?.email?.split('@')[0] || 'Grower',
          email: submitEmail,
          phone: null,
          zipcodes: finalZipcodes,
          source_url: sourceUrlFromParam,
          first_touch_source: sourceUrlFromParam,
          interests: activeInterests.map((si) => ({
            produce_name: si.item.name,
            interest_type: si.type,
            category: si.item.category,
            image: si.item.image,
            is_custom: si.item.id.startsWith('custom_') || si.item.id.startsWith('community_'),
          })),
          preference_pickup: true,
          preference_delivery: true,
          radius_miles: radius,
          home_address: homeAddress,
          accepts_email: true,
          accepts_sms: false,
          accepts_push: true,
          password: undefined,
          user_id: submitUserId,
          ...referralData,
        }
      if (submitEmail) {
        try { localStorage.setItem('guest_email', submitEmail) } catch {}
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const resp = await fetch('/api/interest/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify(submitPayload),
      })
      const respData = await resp.json()

      if (resp.ok || respData?.success) {
        const leadContentName = scope === 'sell' ? 'interest_sell' : 'interest_buy'
        trackMetaLead(leadContentName)
      }

      if (submitUserId) {
        try {
          const profileName = name.trim() || user?.email?.split('@')[0] || 'Grower'
          const now = new Date().toISOString()
          await supabase.from('profiles').upsert({
            id: submitUserId,
            email: submitEmail,
            full_name: profileName,
            zip_code: finalZipcodes[0],
            tos_accepted_at: now,
            profile_completed_at: now,
          }, { onConflict: 'id' })
          setIsProfileComplete(true)
          try { await refresh() } catch {}
          window.dispatchEvent(new CustomEvent('profile-updated', { detail: { fullName: profileName } }))
        } catch (profileErr) {
          console.error('Failed to update profile:', profileErr)
        }
      }

      const newlySavedKeys = new Set(savedInterestKeys)
      activeInterests.forEach(si => newlySavedKeys.add(`${si.item.name.toLowerCase()}_${si.type}`))
      setSavedInterestKeys(newlySavedKeys)
      setUserInterestCount(newlySavedKeys.size)

      setSavedShareInterests(activeInterests.map(i => i.item.name))
      setSavedShareScope(activeInterests[0]?.type || scope || 'buy')
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
      // Guest: open modal at zip step so they enter location before auth
      setIsModalOpen(true)
      setGuestAuthStep('zip')
      return
    }
    // Logged-in: validate zip then open modal
    const finalZipcodes = [...zipcodes]
    if (zipInput.trim() && /^\d{5}$/.test(zipInput.trim()) && !finalZipcodes.includes(zipInput.trim())) {
      finalZipcodes.push(zipInput.trim())
    }
    if (addressFields.zip && /^\d{5}$/.test(addressFields.zip.trim()) && !finalZipcodes.includes(addressFields.zip.trim())) {
      finalZipcodes.push(addressFields.zip.trim())
    }
    if (finalZipcodes.length === 0) {
      setZipError('Please enter your zipcode before saving')
      return
    }
    setIsModalOpen(true)
    setGuestAuthStep('completed')
  }

  const showBuy = scope === 'buy' || scope === null
  const showSell = scope === 'sell' || scope === null

  const headerTitle = scope === 'sell' 
    ? "Select what you grow — we'll notify you when nearby buyers are looking"
    : scope === 'buy' 
    ? "Select what you need — we'll notify you when nearby growers list it"
    : "Set up your produce notifications"

  return (
    <div style={{ ...styles.pageRoot, paddingTop: isStandalone ? 0 : '0px' }}>
      {/* Standalone header for embedded/native mode */}
      {isStandalone && (
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



      {/* Header Section */}
      <section style={styles.headerSection}>
        <div style={styles.headerContent}>
          <h1 style={styles.headerTitle}>{headerTitle}</h1>
          <div style={{ marginTop: '12px' }}>
            <Link href="/my-interests" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#ffffff', color: '#15803d', border: '1.5px solid #86efac', padding: '8px 16px', borderRadius: '9999px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <span>📋 Manage My Interests</span>
              {userInterestCount !== null && userInterestCount > 0 ? (
                <span style={{ backgroundColor: '#16a34a', color: '#ffffff', fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {userInterestCount}
                </span>
              ) : selectedInterests.length > 0 ? (
                <span style={{ backgroundColor: '#86efac', color: '#14532d', fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedInterests.length}
                </span>
              ) : null}
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>
      {/* Produce Search Sub-Bar */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', padding: '16px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Search produce, plants, seeds, flowers, eggs, honey, supplies..."
            style={{ ...styles.searchInput, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <style>{`
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

          /* Custom Interest FAB — floats above sticky bar + native nav */
          #add-custom-interest-fab {
            bottom: 80px;
          }
          @media (max-width: 768px) {
            #add-custom-interest-fab {
              /* 60px native tab bar + 60px sticky save bar + 8px gap */
              bottom: 128px;
            }
          }

          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }

          /* Custom Interest Modal — mobile-safe sizing */
          #custom-interest-modal {
            max-height: 88vh;
            max-height: 88dvh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }
          @media (max-width: 768px) {
            /* Override the overlay to align modal to bottom on mobile */
            #add-custom-interest-fab {
              bottom: 128px;
            }
            .custom-interest-overlay-mobile {
              align-items: flex-end !important;
              padding: 0 !important;
            }
            #custom-interest-modal {
              border-radius: 24px 24px 0 0 !important;
              max-width: 100% !important;
              width: 100% !important;
              max-height: 88dvh !important;
              max-height: 88vh !important;
              margin: 0 !important;
            }
            #custom-interest-modal img {
              height: 110px !important;
              min-height: 44px;
            }
            #custom-interest-upload-label,
            #custom-interest-camera-label {
              min-height: 44px;
            }
            #custom-interest-add-btn {
              min-height: 48px;
            }
          }
        `}</style>

      </div>

      {/* Main Grid Content */}
      <main style={styles.gridContainer}>
        {(() => {
          const trimmedSearch = searchQuery.trim()
          const exactMatchExists = trimmedSearch ? EXHAUSTIVE_US_PRODUCE.some((item) => item.name.toLowerCase() === trimmedSearch.toLowerCase()) : true
          
          const isValidCustomItem = trimmedSearch.length >= 2 && !exactMatchExists && checkTextForViolations(trimmedSearch).isClean

          const customItem: ProduceItem | null = isValidCustomItem ? {
            id: `custom_${trimmedSearch.toLowerCase().replace(/\s+/g, '_')}`,
            name: trimmedSearch.charAt(0).toUpperCase() + trimmedSearch.slice(1),
            category: 'produce',
            displayCategory: 'Custom Interest',
            image: fetchedCustomImage || getProduceImage(trimmedSearch),
            buyersCount: 0,
            sellersCount: 0,
            unit: 'item',
          } : null

          const itemsToRender = customItem ? [customItem, ...filteredItems] : filteredItems

          return (
            <>
              {itemsToRender.length === 0 && (
                <div style={styles.noResultsBox}>
                  🔍 No produce or garden items found matching &quot;{searchQuery}&quot;.
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
                      data-testid="produce-card"
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', marginBottom: '8px' }}>
                          <h3 style={styles.cardTitle}>{item.name}</h3>
                        </div>

                        <div style={styles.cardCheckboxes}>
                          {showSell && (() => {
                            const isSellSaved = savedInterestKeys.has(`${item.name.toLowerCase()}_sell`)
                            return (
                              <label style={{ ...styles.checkboxLabel, opacity: isSellSaved ? 0.85 : 1 }}>
                                <input
                                  type="checkbox"
                                  checked={isSellSaved || sellingSelected}
                                  onChange={() => {
                                    if (!isSellSaved) handleSelectInterest(item, 'sell')
                                  }}
                                  style={styles.checkboxInput}
                                />
                                {isSellSaved ? '✓ Saved' : 'I have this'}
                              </label>
                            )
                          })()}
                          {showBuy && (() => {
                            const isBuySaved = savedInterestKeys.has(`${item.name.toLowerCase()}_buy`)
                            return (
                              <label style={{ ...styles.checkboxLabel, opacity: isBuySaved ? 0.85 : 1 }}>
                                <input
                                  type="checkbox"
                                  checked={isBuySaved || buyingSelected}
                                  onChange={() => {
                                    if (!isBuySaved) handleSelectInterest(item, 'buy')
                                  }}
                                  style={styles.checkboxInput}
                                />
                                {isBuySaved ? '✓ Saved' : 'I want this'}
                              </label>
                            )
                          })()}
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
              {/* Auth (Google/Apple/OTP) for guests */}
              {!userId && guestAuthStep === 'auth' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const supabase = createClient()
                        // Persist selected interests so they survive OAuth redirect
                        if (typeof window !== 'undefined') {
                          try {
                            const draft = { scope, selectedInterests: selectedInterests.map(si => ({ name: si.item.name, type: si.type })), zipcodes }
                            localStorage.setItem('casagrown_interest_draft', JSON.stringify(draft))
                          } catch {}
                        }
                        await supabase.auth.signInWithOAuth({
                          provider: 'google',
                          options: { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent('/interest?scope=' + (scope || 'buy'))}` : undefined }
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
                        // Persist selected interests so they survive OAuth redirect
                        if (typeof window !== 'undefined') {
                          try {
                            const draft = { scope, selectedInterests: selectedInterests.map(si => ({ name: si.item.name, type: si.type })), zipcodes }
                            localStorage.setItem('casagrown_interest_draft', JSON.stringify(draft))
                          } catch {}
                        }
                        await supabase.auth.signInWithOAuth({
                          provider: 'apple',
                          options: { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent('/interest?scope=' + (scope || 'buy'))}` : undefined }
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
                      {otpSending ? 'Sending code...' : 'Continue with email'}
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

              {/* Zipcode + details form: shown for logged-in users OR for guests collecting zip before auth */}
              {(userId || guestAuthStep === 'completed' || guestAuthStep === 'zip') && (
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

                  {/* Guest at zip step: save draft + go to auth. Otherwise normal submit. */}
                  {guestAuthStep === 'zip' ? (
                    <button
                      type="button"
                      onClick={() => {
                        const finalZips = [...zipcodes]
                        if (zipInput.trim() && /^\d{5}$/.test(zipInput.trim()) && !finalZips.includes(zipInput.trim())) {
                          setZipcodes(prev => [...prev, zipInput.trim()])
                          finalZips.push(zipInput.trim())
                          setZipInput('')
                        }
                        if (finalZips.length === 0) {
                          setZipError('Please enter at least one zipcode')
                          return
                        }
                        try {
                          localStorage.setItem('casagrown_interest_draft', JSON.stringify({
                            scope,
                            selectedInterests: selectedInterests.map(si => ({ name: si.item.name, type: si.type })),
                            zipcodes: finalZips,
                          }))
                        } catch {}
                        setGuestAuthStep('auth')
                      }}
                      style={{ ...styles.btnPrimary, width: '100%', marginTop: '8px' }}
                    >
                      Continue to Sign In →
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      style={{ ...styles.btnPrimary, width: '100%', marginTop: '8px' }}
                    >
                      {isSubmitting ? 'Saving...' : 'Save & Get Notified'}
                    </button>
                  )}
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

      {/* ── + FAB: Add Custom Interest ── */}
      <button
        id="add-custom-interest-fab"
        onClick={() => {
          setCustomModalOpen(true)
          setCustomName('')
          setCustomNameError('')
          setCustomCandidates([])
          setCustomSelectedImage('')
          setCustomUploadPreview('')
          setCustomUploadFile(null)
          setCustomAddError('')
          setCustomIntent(scope === 'sell' ? 'sell' : 'buy')
        }}
        title="Add a custom interest"
        style={{
          position: 'fixed',
          /* bottom controlled exclusively by #add-custom-interest-fab CSS class */
          right: '20px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          color: 'white',
          border: 'none',
          fontSize: '26px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(22,163,74,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 210,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(22,163,74,0.55)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(22,163,74,0.45)' }}
      >
        +
      </button>

      {/* ── Custom Interest Modal ── */}
      {customModalOpen && (
        <div
          style={styles.modalOverlay}
          className="custom-interest-overlay-mobile"
          onClick={() => setCustomModalOpen(false)}
        >
          <div
            id="custom-interest-modal"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle — visible on mobile */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px', paddingBottom: '2px' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: '#d1d5db' }} />
            </div>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>➕ Add Custom Interest</h2>
              <button style={styles.modalCloseBtn} onClick={() => setCustomModalOpen(false)}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px', marginTop: 0 }}>
                Can't find what you grow or want? Add it here and we'll match you with nearby neighbors.
              </p>

              {/* Name Input — auto-searches images after 600ms */}
              <div style={{ marginBottom: '4px' }}>
                <label style={styles.label}>What do you grow or want? *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="custom-interest-name-input"
                    type="text"
                    value={customName}
                    maxLength={50}
                    placeholder="e.g. Dragon Fruit, Jackfruit, Loquat..."
                    style={{ ...styles.input, paddingRight: customSearching ? '42px' : '14px' }}
                    onChange={e => {
                      const val = e.target.value
                      setCustomName(val)
                      setCustomAddError('')
                      setCustomCandidates([])
                      setCustomSelectedImage('')
                      setCustomUploadPreview('')
                      setCustomUploadFile(null)

                      // Cancel any pending search
                      if (customSearchTimer.current) clearTimeout(customSearchTimer.current)

                      const trimmed = val.trim()
                      if (trimmed.length < 2) { setCustomNameError(''); return }
                      if (!/^[a-zA-Z\s\-]+$/.test(trimmed)) {
                        setCustomNameError('Only letters, spaces, and hyphens allowed')
                        return
                      }
                      const modCheck = checkTextForViolations(trimmed)
                      if (!modCheck.isClean) {
                        setCustomNameError(modCheck.error || 'This name is not allowed')
                        return
                      }
                      const allNames = [...EXHAUSTIVE_US_PRODUCE, ...communityItems].map(p => p.name.toLowerCase())
                      if (allNames.includes(trimmed.toLowerCase())) {
                        setCustomNameError('This item is already in the catalog — find it by searching above')
                        return
                      }
                      setCustomNameError('')

                      // Auto-search images after 600ms of no typing
                      customSearchTimer.current = setTimeout(async () => {
                        setCustomSearching(true)
                        try {
                          const supabase = createClient()
                          const { data: blocked } = await supabase
                            .from('blocked_products')
                            .select('product_name')
                          if (blocked?.some((b: any) => trimmed.toLowerCase().includes(b.product_name.toLowerCase()))) {
                            setCustomNameError('This item name is not permitted on CasaGrown')
                            setCustomSearching(false)
                            return
                          }
                          const res = await fetch(`/api/interest/candidates?name=${encodeURIComponent(trimmed)}`)
                          const data = await res.json()
                          setCustomCandidates(data.candidates || [])
                          if (data.candidates?.length > 0) setCustomSelectedImage(data.candidates[0])
                        } catch {
                          setCustomCandidates([])
                        } finally {
                          setCustomSearching(false)
                        }
                      }, 600)
                    }}
                  />
                  {/* Spinner shown inside input while searching */}
                  {customSearching && (
                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', pointerEvents: 'none' }}>⏳</div>
                  )}
                </div>
                {customNameError && <div style={styles.errorText}>{customNameError}</div>}
              </div>

              {/* Image Picker — shows candidates and user's uploaded/captured photo in selection grid */}
              {(customSearching || customCandidates.length > 0 || customUploadPreview) && (
                <div style={{ marginTop: '16px', marginBottom: '4px' }}>
                  <label style={styles.label}>
                    {customSearching ? 'Finding images…' : 'Pick an image'}
                  </label>
                  {customSearching ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ height: '90px', borderRadius: '10px', background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      {/* Featured User Photo Tile */}
                      {customUploadPreview && (
                        <div
                          style={{
                            border: customSelectedImage === customUploadPreview ? '3px solid #16a34a' : '2px solid #e5e7eb',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            padding: 0,
                            cursor: 'pointer',
                            background: '#f0fdf4',
                            position: 'relative',
                            height: '90px',
                          }}
                          onClick={() => setCustomSelectedImage(customUploadPreview)}
                        >
                          <img
                            src={customUploadPreview}
                            alt="Your Photo"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                          {/* Remove Photo Button */}
                          <button
                            type="button"
                            title="Remove photo"
                            onClick={(e) => {
                              e.stopPropagation()
                              setCustomUploadPreview('')
                              setCustomUploadFile(null)
                              if (customCandidates.length > 0) {
                                setCustomSelectedImage(customCandidates[0])
                              } else {
                                setCustomSelectedImage('')
                              }
                            }}
                            style={{
                              position: 'absolute',
                              top: '4px',
                              left: '4px',
                              background: 'rgba(239,68,68,0.9)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              width: '22px',
                              height: '22px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              zIndex: 5,
                            }}
                          >
                            ✕
                          </button>
                          {customSelectedImage === customUploadPreview && (
                            <div style={{ position: 'absolute', top: '4px', right: '4px', background: '#16a34a', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px' }}>✓</div>
                          )}
                          <div style={{ position: 'absolute', bottom: '0', left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', padding: '2px 4px', textAlign: 'center', fontWeight: 600 }}>Your Photo</div>
                        </div>
                      )}

                      {/* Candidate Image Tiles */}
                      {customCandidates.map((url, idx) => (
                        <button
                          key={url}
                          id={`custom-interest-img-tile-${idx}`}
                          type="button"
                          onClick={() => { setCustomSelectedImage(url); setCustomUploadPreview(''); setCustomUploadFile(null) }}
                          style={{
                            border: customSelectedImage === url ? '3px solid #16a34a' : '2px solid #e5e7eb',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            padding: 0,
                            cursor: 'pointer',
                            background: 'none',
                            position: 'relative',
                          }}
                        >
                          <img
                            src={url}
                            alt={`Option ${idx + 1}`}
                            style={{ width: '100%', height: '90px', objectFit: 'cover', display: 'block' }}
                            onError={e => { (e.currentTarget as HTMLImageElement).src = '/images/produce_placeholder.jpg' }}
                          />
                          {customSelectedImage === url && (
                            <div style={{ position: 'absolute', top: '4px', right: '4px', background: '#16a34a', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px' }}>✓</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Upload / Camera — Brings photo straight into active selection */}
              <div style={{ marginTop: '16px', marginBottom: '16px' }}>
                <label style={{ ...styles.label, marginBottom: '10px' }}>Or use your own photo</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {/* Upload from library */}
                  <label
                    id="custom-interest-upload-label"
                    htmlFor="custom-interest-file-input"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '11px 14px',
                      borderRadius: '12px',
                      border: customUploadFile ? '2px solid #16a34a' : '1.5px dashed #d1d5db',
                      backgroundColor: customUploadFile ? '#f0fdf4' : '#f9fafb',
                      fontSize: '13px',
                      color: customUploadFile ? '#16a34a' : '#6b7280',
                      cursor: 'pointer',
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  >
                    📁 {customUploadFile ? '✓ Photo Selected' : 'Upload photo'}
                  </label>
                  <input
                    id="custom-interest-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 5 * 1024 * 1024) { setCustomAddError('Image must be under 5MB'); return }
                      setCustomUploadFile(file)
                      const reader = new FileReader()
                      reader.onload = ev => {
                        const dataUrl = ev.target?.result as string
                        setCustomUploadPreview(dataUrl)
                        setCustomSelectedImage(dataUrl)
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                  {/* Take photo with camera widget */}
                  <button
                    id="custom-interest-camera-btn"
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
                        setShowWebCameraModal(true)
                      } else {
                        document.getElementById('custom-interest-camera-input')?.click()
                      }
                    }}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '11px 14px',
                      borderRadius: '12px',
                      border: '1.5px dashed #d1d5db',
                      backgroundColor: '#f9fafb',
                      fontSize: '13px',
                      color: '#6b7280',
                      cursor: 'pointer',
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  >
                    📷 Take photo
                  </button>
                  <input
                    id="custom-interest-camera-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 5 * 1024 * 1024) { setCustomAddError('Image must be under 5MB'); return }
                      setCustomUploadFile(file)
                      const reader = new FileReader()
                      reader.onload = ev => {
                        const dataUrl = ev.target?.result as string
                        setCustomUploadPreview(dataUrl)
                        setCustomSelectedImage(dataUrl)
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                </div>
                {/* Clear Photo Action Button */}
                {customUploadPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomUploadPreview('')
                      setCustomUploadFile(null)
                      if (customCandidates.length > 0) {
                        setCustomSelectedImage(customCandidates[0])
                      } else {
                        setCustomSelectedImage('')
                      }
                    }}
                    style={{
                      marginTop: '8px',
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0,
                    }}
                  >
                    🗑️ Remove photo &amp; reset selection
                  </button>
                )}
              </div>

              {customAddError && <div style={{ ...styles.errorText, marginBottom: '12px' }}>{customAddError}</div>}

              {/* I have this / I want this toggle — only shown if scope param is NOT provided */}
              {!scope && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ ...styles.label, marginBottom: '10px' }}>I want to…</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setCustomIntent('buy')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '12px',
                        border: customIntent === 'buy' ? '2px solid #16a34a' : '1.5px solid #e5e7eb',
                        backgroundColor: customIntent === 'buy' ? '#f0fdf4' : '#ffffff',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontWeight: 600,
                        fontSize: '14px',
                        color: customIntent === 'buy' ? '#15803d' : '#6b7280',
                      }}
                    >
                      🛒 Buy / Want this
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomIntent('sell')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '12px',
                        border: customIntent === 'sell' ? '2px solid #16a34a' : '1.5px solid #e5e7eb',
                        backgroundColor: customIntent === 'sell' ? '#f0fdf4' : '#ffffff',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontWeight: 600,
                        fontSize: '14px',
                        color: customIntent === 'sell' ? '#15803d' : '#6b7280',
                      }}
                    >
                      🌱 Grow / Have this
                    </button>
                  </div>
                </div>
              )}

              {customAddError && <div style={{ ...styles.errorText, marginBottom: '12px' }}>{customAddError}</div>}

              {/* Add & Auto-select Button */}
              <button
                id="custom-interest-add-btn"
                type="button"
                disabled={customAdding || customUploading || customName.trim().length < 2 || !!customNameError || (!customSelectedImage && !customUploadFile)}
                onClick={async () => {
                  const trimmed = customName.trim()
                  if (!trimmed || customNameError) return
                  if (!customSelectedImage && !customUploadFile) {
                    setCustomAddError('Please pick or upload an image')
                    return
                  }

                  setCustomAdding(true)
                  setCustomAddError('')
                  try {
                    const supabase = createClient()
                    let finalImageUrl = customSelectedImage

                    // Upload user's own image if provided
                    if (customUploadFile) {
                      if (userId) {
                        setCustomUploading(true)
                        const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_')
                        const ext = customUploadFile.name.split('.').pop()?.toLowerCase() || 'jpg'
                        const path = `community/${userId}/${slug}_${Date.now()}.${ext}`
                        const { error: upErr } = await supabase.storage
                          .from('interest-images')
                          .upload(path, customUploadFile, { upsert: true })
                        if (upErr) throw new Error(upErr.message)
                        const { data: urlData } = supabase.storage.from('interest-images').getPublicUrl(path)
                        finalImageUrl = urlData.publicUrl
                        setCustomUploading(false)
                      } else {
                        finalImageUrl = customUploadPreview
                      }
                    }

                    // Upsert to community_produce_catalog if logged in
                    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_')
                    const displayName = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
                    if (userId) {
                      await supabase.from('community_produce_catalog').upsert(
                        { id: slug, name: displayName, category: 'produce', image: finalImageUrl || '/images/produce_placeholder.jpg' },
                        { onConflict: 'id' }
                      )
                    }

                    const newItem: ProduceItem = {
                      id: `community_${slug}`,
                      name: displayName,
                      category: 'produce',
                      displayCategory: 'Community Item',
                      image: finalImageUrl || '/images/produce_placeholder.jpg',
                      buyersCount: 1,
                      sellersCount: 0,
                      unit: 'item',
                    }

                    // 1. Add to community items grid
                    setCommunityItems(prev => [newItem, ...prev.filter(p => p.id !== newItem.id)])

                    // 2. Auto-select this custom item with chosen intent or scope
                    const targetType = scope || customIntent
                    setSelectedInterests(prev => [
                      ...prev.filter(si => !(si.item.id === newItem.id && si.type === targetType)),
                      { item: newItem, type: targetType }
                    ])

                    // 3. Close custom modal
                    setCustomModalOpen(false)
                  } catch (err: any) {
                    setCustomAddError(err?.message || 'Failed to add custom interest')
                    setCustomUploading(false)
                  } finally {
                    setCustomAdding(false)
                  }
                }}
                style={{
                  ...styles.btnPrimary,
                  width: '100%',
                  opacity: (customAdding || customUploading || customName.trim().length < 2 || !!customNameError || (!customSelectedImage && !customUploadFile)) ? 0.5 : 1,
                  cursor: (customAdding || customUploading || customName.trim().length < 2 || !!customNameError || (!customSelectedImage && !customUploadFile)) ? 'not-allowed' : 'pointer',
                }}
              >
                {customUploading ? '⏳ Uploading image...' : customAdding ? '⏳ Adding...' : '➕ Add to My Selections'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Web Camera Modal */}
      {showWebCameraModal && (
        <InlineWebCameraModal
          onCapture={(dataUrl, file) => {
            setShowWebCameraModal(false)
            setCustomUploadPreview(dataUrl)
            setCustomSelectedImage(dataUrl)
            setCustomUploadFile(file)
          }}
          onClose={() => setShowWebCameraModal(false)}
        />
      )}

      {/* Social Share Modal for Saved Interests (Buyer Wishlist or Seller Harvest) */}
      {savedShareInterests.length > 0 && (
        <SocialShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          title={savedShareScope === 'sell' ? 'Share Your Harvest with Neighbors' : 'Share Wishlist with Neighbors'}
          subtitle={savedShareScope === 'sell' ? 'Let local neighbors know what produce you grow in your backyard!' : "Let local gardeners know what produce you're looking to buy!"}
          entityName={savedShareInterests.join(', ')}
          shareUrl={
            savedShareScope === 'sell'
              ? `${process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com')}/demand?items=${encodeURIComponent(savedShareInterests.join(','))}&mode=buy${userId ? `&ref=${userId}` : ''}`
              : `${process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com')}/demand?items=${encodeURIComponent(savedShareInterests.join(','))}&mode=sell${userId ? `&ref=${userId}` : ''}`
          }
          shareMessage={(platform) => {
            const itemList = savedShareInterests.join(', ')
            if (savedShareScope === 'sell') {
              if (platform === 'whatsapp') {
                return `*Backyard Harvest Announcement!* 🥦\n\nHey neighbors! I'm growing fresh *${itemList}* in my garden.\n\nSet your buy interest on CasaGrown so I can notify you when I harvest:\n`
              }
              return `Hey neighbors! I'm growing fresh ${itemList} in my garden! Set your buy interest on CasaGrown so I can notify you when I harvest!`
            }
            if (platform === 'whatsapp') {
              return `*Produce Wishlist Alert!* 🥦\n\nHey neighbors! I'm looking to buy fresh backyard harvest: *${itemList}* on CasaGrown.\n\nIf you have extra growing in your garden, list your harvest here so I can buy from you:\n`
            }
            return `Hey neighbors! I'm searching for fresh local produce (${itemList}). If you have extra in your backyard, list it on CasaGrown so neighbors can buy local!`
          }}
          shareContext={savedShareScope === 'sell' ? 'community_invite' : 'buy_request'}
          userId={userId || undefined}
          imageUrl={getProduceImage(savedShareInterests[0])}
        />
      )}
    </div>
  )
}

export default function InterestPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }} />}>
      <InterestPageContent />
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
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

function InlineWebCameraModal({
  onCapture,
  onClose,
}: {
  onCapture: (dataUrl: string, file: File) => void
  onClose: () => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [stream, setStream] = React.useState<MediaStream | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    async function initCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (!active) {
          mediaStream.getTracks().forEach((t) => t.stop())
          return
        }
        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          videoRef.current.play()
        }
      } catch (err: any) {
        if (active) setError(err?.message || 'Camera permission denied or unavailable.')
      }
    }
    initCamera()
    return () => {
      active = false
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const handleTakePhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' })
        onCapture(dataUrl, file)
      }
    }, 'image/jpeg', 0.9)
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#1f2937', borderRadius: '20px', overflow: 'hidden', maxWidth: '500px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #374151' }}>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '16px' }}>📷 Take Photo</span>
          <button type="button" onClick={() => { if (stream) stream.getTracks().forEach(t => t.stop()); onClose() }} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ width: '100%', height: '320px', backgroundColor: 'black', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error ? (
            <div style={{ color: '#ef4444', padding: '20px', textAlign: 'center', fontSize: '14px' }}>{error}</div>
          ) : (
            <video ref={videoRef} playsInline autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div style={{ padding: '16px', display: 'flex', gap: '12px', width: '100%', justifyContent: 'center' }}>
          <button type="button" onClick={() => { if (stream) stream.getTracks().forEach(t => t.stop()); onClose() }} style={{ padding: '10px 20px', borderRadius: '12px', border: '1px solid #4b5563', backgroundColor: '#374151', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={handleTakePhoto} disabled={!stream} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#22c55e', color: 'white', fontWeight: 700, cursor: stream ? 'pointer' : 'not-allowed' }}>📸 Snap Photo</button>
        </div>
      </div>
    </div>
  )
}
