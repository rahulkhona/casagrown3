'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import { checkTextForViolations } from '../../../lib/moderation'
import { EXHAUSTIVE_INTERESTS_CATALOG } from '../../../lib/interestCatalog'
import { extractBaseProduce, getProduceImage } from '../../../lib/produceCatalog'
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '../terms/page'
import AddressInput from '../../components/AddressInput'
import {
  AddressFields,
  EMPTY_ADDRESS,
  formatFullAddress,
  isAddressComplete,
} from '../../../lib/address'
import {
  ProduceRowItem,
  ALLOWED_UNITS,
  PRODUCE_CATEGORIES,
  FULFILLMENT_PRESET_OPTIONS,
  FulfillmentPresetType,
  parseProduceParams,
  createRowFromProduceName,
  getWindowsForPreset,
  isHourSelected,
  toggleHourCell,
  convertPrice,
  normalizeProduceKey,
} from '../../../lib/bulkListingUtils'





import {
  resetSessionId,
  trackEvent,
  trackFieldInteract,
  trackStepTiming,
  trackMetaLead,
} from '../../../lib/crm-analytics'
import CameraCapture, { CaptureResult } from '../../../components/CameraCapture'
import SocialShareModal from '../../components/SocialShareModal'
import { geocodeAddress } from '../../../lib/geocode'
import { autoPostProductToCommunity } from '../../../../../packages/app/features/community-chat/auto-post-service'
import styles from './bulk-listing.module.css'


const PAGE_SLUG = '/list_bulk'

export default function BulkListingClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const { user, isAuthenticated, tosAccepted, refresh: refreshAuth } = useAuth()

  // ── Session & Tracking Refs ──
  const stepEnteredAt = useRef(Date.now())
  const hasAbandoned = useRef(false)
  const isSubmittedRef = useRef(false)

  // ── Produce Grid State ──
  const [produceRows, setProduceRows] = useState<ProduceRowItem[]>([])
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [activeCameraRowId, setActiveCameraRowId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTargetRowId, setUploadTargetRowId] = useState<string | null>(null)

  // ── Fulfillment State ──
  const [offersDelivery, setOffersDelivery] = useState(true)
  const [offersPickup, setOffersPickup] = useState(false)
  const [zipcode, setZipcode] = useState('')
  const [zipInput, setZipInput] = useState('')
  const [deliveryMode, setDeliveryMode] = useState<'zipcode' | 'address_radius'>('zipcode')
  const [deliveryBaseAddr, setDeliveryBaseAddr] = useState<AddressFields>(EMPTY_ADDRESS)
  const [deliveryRadius, setDeliveryRadius] = useState(5)
  const [deliveryZipcodes, setDeliveryZipcodes] = useState<string[]>([])
  const [deliveryPreset, setDeliveryPreset] = useState<FulfillmentPresetType>('both')
  const [customDeliveryWindows, setCustomDeliveryWindows] = useState<Record<string, string[]>>(() =>
    getWindowsForPreset('both')
  )

  const [pickupAddr, setPickupAddr] = useState<AddressFields>(EMPTY_ADDRESS)
  const [pickupPreset, setPickupPreset] = useState<FulfillmentPresetType>('both')
  const [customPickupWindows, setCustomPickupWindows] = useState<Record<string, string[]>>(() =>
    getWindowsForPreset('both')
  )

  const [geolocatingDelivery, setGeolocatingDelivery] = useState(false)
  const [geolocatingPickup, setGeolocatingPickup] = useState(false)
  const [existingBoothId, setExistingBoothId] = useState<string | null>(null)
  const [showSuccessShareModal, setShowSuccessShareModal] = useState(false)
  const [successBoothId, setSuccessBoothId] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const hasUserEditedFulfillmentRef = useRef(false)
  const hasPublishedRef = useRef(false)
  const userModifiedPriceRowIds = useRef<Set<string>>(new Set())




  const handleAddZipTag = (val: string) => {
    const clean = val.trim().replace(/[^0-9]/g, '')
    if (clean.length === 5 && !deliveryZipcodes.includes(clean)) {
      const updated = [...deliveryZipcodes, clean]
      setDeliveryZipcodes(updated)
      if (!zipcode) setZipcode(clean)
      setZipInput('')
      trackFieldInteract(PAGE_SLUG, 1, 'delivery_zipcodes', true)
    }
  }

  const handleRemoveZipTag = (zipToRemove: string) => {
    const updated = deliveryZipcodes.filter(z => z !== zipToRemove)
    setDeliveryZipcodes(updated)
    setZipcode(updated[0] || '')
    trackFieldInteract(PAGE_SLUG, 1, 'delivery_zipcodes', updated.length > 0)
  }

  const handlePasteZips = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    const matches = text.match(/\b\d{5}\b/g)
    if (matches && matches.length > 0) {
      e.preventDefault()
      const uniqueNew = matches.filter(z => !deliveryZipcodes.includes(z))
      if (uniqueNew.length > 0) {
        const updated = [...deliveryZipcodes, ...uniqueNew]
        setDeliveryZipcodes(updated)
        if (!zipcode) setZipcode(updated[0])
        setZipInput('')
        trackFieldInteract(PAGE_SLUG, 1, 'delivery_zipcodes', true)
      }
    }
  }

  // ── Multi-Step Publish Modal State (matching /sell) ──
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<'contact' | 'otp' | 'review'>('contact')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPhone, setAuthPhone] = useState('')
  const [authOtp, setAuthOtp] = useState('')
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [agreedTos, setAgreedTos] = useState(false)
  const [smsConsent, setSmsConsent] = useState(true)
  const [authError, setAuthError] = useState('')
  const [legalModalContent, setLegalModalContent] = useState<'tos' | 'privacy' | null>(null)
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null)

  // ── Dynamic Local Buyer Demand Proof State ──
  const [buyerDemand, setBuyerDemand] = useState<{
    totalBuyers: number
    locationLabel: string
    produceCounts: Record<string, number>
    loading: boolean
  }>({
    totalBuyers: 0,
    locationLabel: 'In Your Area',
    produceCounts: {},
    loading: true,
  })

  useEffect(() => {
    let isMounted = true
    async function loadBuyerDemand() {
      try {
        const cleanZip = (zipcode || searchParams.get('zipcode') || searchParams.get('zip') || '')
          .trim().replace(/[^0-9]/g, '')

        const res = await fetch(`/api/interest/demand?zipcode=${encodeURIComponent(cleanZip)}`)
        if (res.ok) {
          const json = await res.json()
          if (json.success && isMounted) {
            setBuyerDemand({
              totalBuyers: json.totalBuyers || 0,
              locationLabel: json.locationLabel || (cleanZip ? `In ${cleanZip}` : 'In Your Area'),
              produceCounts: json.produceCounts || {},
              loading: false,
            })
            return
          }
        }
        if (isMounted) {
          setBuyerDemand(prev => ({ 
            ...prev, 
            totalBuyers: 0, 
            locationLabel: cleanZip ? `In ${cleanZip}` : 'In Your Area', 
            loading: false 
          }))
        }
      } catch {
        if (isMounted) setBuyerDemand(prev => ({ ...prev, loading: false }))
      }
    }
    loadBuyerDemand()
    return () => { isMounted = false }
  }, [zipcode, searchParams])



  // ── Platform Fee Dynamic Resolution ──
  const [platformFeePct, setPlatformFeePct] = useState(10)

  useEffect(() => {
    supabase
      .from('platform_fees')
      .select('free_fee_pct')
      .eq('country_code', 'USA')
      .order('creation_date', { ascending: false })
      .limit(1)
      .then(({ data }: { data: any }) => {
        const row = Array.isArray(data) ? data[0] : data
        if (row?.free_fee_pct !== undefined && row?.free_fee_pct !== null) {
          setPlatformFeePct(Number(row.free_fee_pct))
        }
      })
      .catch(() => {})
  }, [supabase])

  // ── Submission State ──
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState('')

  // ── 7-Day Matrix Day Options for Custom Calendar ──
  const dayOptions = useMemo(() => {
    const localToday = new Date()
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const options: { date: string; label: string; isWeekend: boolean }[] = []
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + offset)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      const label = DAY_SHORT[d.getDay()]
      options.push({ date: dateStr, label, isWeekend })
    }
    return options
  }, [])

  // ── 1. Initialize Produce Rows from URL Parameters ──
  useEffect(() => {
    resetSessionId(PAGE_SLUG)
    trackEvent('wizard_step', PAGE_SLUG, { step_index: 1, step_name: 'bulk_grid' })

    const rawParam = searchParams.get('produce') || searchParams.get('items')
    const rawZip = searchParams.get('zipcode') || searchParams.get('zip')
    if (rawZip) {
      const cleanZip = rawZip.trim().replace(/[^0-9]/g, '')
      setZipcode(cleanZip)
      if (cleanZip.length === 5) {
        setDeliveryZipcodes([cleanZip])
        setZipInput(cleanZip)
      }
    }

    const parsedNames = parseProduceParams(rawParam)

    // Check for draft recovery ONLY if returning from OAuth
    const isOAuthReturn = searchParams.get('autostart') === '1'
    if (isOAuthReturn && typeof window !== 'undefined') {
      const storedDraft = localStorage.getItem('casagrown_bulk_listing_draft')
      if (storedDraft) {
        try {
          const draft = JSON.parse(storedDraft)
          if (draft.produceRows && draft.produceRows.length > 0) {
            setProduceRows(draft.produceRows)
            if (draft.offersDelivery !== undefined) setOffersDelivery(draft.offersDelivery)
            if (draft.offersPickup !== undefined) setOffersPickup(draft.offersPickup)
            // Mark guard so loadLocationOrBooth doesn't overwrite the restored fulfillment choices
            if (draft.offersDelivery !== undefined || draft.offersPickup !== undefined) {
              hasUserEditedFulfillmentRef.current = true
            }
            if (draft.zipcode) setZipcode(draft.zipcode)
            if (draft.deliveryBaseAddr) setDeliveryBaseAddr(draft.deliveryBaseAddr)
            if (draft.deliveryRadius) setDeliveryRadius(draft.deliveryRadius)
            if (draft.deliveryZipcodes) setDeliveryZipcodes(draft.deliveryZipcodes)
            if (draft.deliveryPreset) setDeliveryPreset(draft.deliveryPreset)
            if (draft.pickupAddr) setPickupAddr(draft.pickupAddr)
            if (draft.pickupPreset) setPickupPreset(draft.pickupPreset)
            localStorage.removeItem('casagrown_bulk_listing_draft')
            return

          }
        } catch {
          /* ignore parse error */
        }
      }
    } else if (typeof window !== 'undefined') {
      // Clear any stale previous draft
      localStorage.removeItem('casagrown_bulk_listing_draft')
    }

    if (parsedNames.length > 0) {
      const rows = parsedNames.map((name, i) => {
        const r = createRowFromProduceName(name, `url_row_${i}`)
        return {
          ...r,
          isSelected: false,
          quantity: r.quantity || '5',
          priceUsd: r.priceUsd || '3.50',
        }
      })
      setProduceRows(rows)
      rows.forEach((r, idx) => {
        trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_name_auto`, true)
        trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_qty`, true)
        trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_selected`, false)
      })
    } else {
      // Sensible seasonal defaults when no URL params provided
      const defaultCrops = ['tomatoes', 'cucumbers', 'lemons', 'strawberries', 'basil', 'bell_peppers', 'chicken_eggs', 'raw_honey']
      const rows = defaultCrops.map((name, i) => {
        const r = createRowFromProduceName(name, `default_row_${i}`)
        return {
          ...r,
          isSelected: false,
          quantity: r.quantity || '5',
          priceUsd: r.priceUsd || '3.50',
        }
      })
      setProduceRows(rows)
    }
  }, [searchParams])


  // ── Async pricing resolver for URL pre-filled items ──
  useEffect(() => {
    if (produceRows.length === 0) return

    async function resolvePrices() {
      // Find rows that don't have a price yet
      const rowsToResolve = produceRows.filter(r => !r.priceUsd)
      if (rowsToResolve.length === 0) return

      let changed = false
      const updatedRows = produceRows.map((row, idx) => {
        if (!row.priceUsd) {
          // Determine fallback based on category
          let resolvedPrice = '3.00' // Default fallback
          if (row.category === 'eggs') resolvedPrice = '6.00'
          else if (row.category === 'honey') resolvedPrice = '10.00'
          else if (row.category === 'flowers') resolvedPrice = '8.00'
          else if (row.category === 'plants') resolvedPrice = '7.00'
          else if (row.category === 'seedlings') resolvedPrice = '4.00'
          
          changed = true
          return {
            ...row,
            priceUsd: resolvedPrice,
          }
        }
        return row
      })

      if (changed) {
        setProduceRows(updatedRows)
        // Fire price tracking events
        updatedRows.forEach((r, idx) => {
          if (r.priceUsd) {
            trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_price`, true)
          }
        })
      }

      // Now query database for accurate benchmark or market prices in parallel
      await Promise.all(
        rowsToResolve.map(async (row) => {
          try {
            // 1. Query cached Kroger / USDA benchmark price via RPC
            const { data: benchmarkData } = await supabase.rpc('get_suggested_produce_price', {
              p_produce_name: row.name,
              p_zip_code: zipcode || '95120',
            })

            if (benchmarkData && benchmarkData.found && benchmarkData.suggested_price) {
              setProduceRows(prev =>
                prev.map(r => (r.id === row.id ? { 
                  ...r, 
                  priceUsd: String(benchmarkData.suggested_price),
                  unit: benchmarkData.unit || r.unit,
                } : r))
              )
              return
            }
          } catch (e) {
            console.warn('Error resolving price for', row.name, e)
          }
        })
      )
    }

    resolvePrices()
  }, [produceRows.length, zipcode, supabase])


  // ── 2. Auto-Detect Location / Prefill Booth if Logged In ──
  useEffect(() => {
    async function loadLocationOrBooth() {
      // After publish has started, don't re-read the booth from DB — the
      // newly created booth still has the schema DEFAULT offers_pickup=true
      // and would overwrite the user's delivery-only selection.
      if (hasPublishedRef.current) {
        return
      }

      if (user?.id) {

        // Fetch existing default booth and prefill fulfillment options
        try {
          // Fetch profile name
          const { data: prof } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle()

          if (prof?.full_name) {
            setAuthName(prof.full_name)
          }

          const { data: userBooths } = await supabase
            .from('market_booths')
            .select('id, name, booth_zip, delivery_zipcodes, is_default, offers_delivery, offers_pickup, pickup_street, pickup_city, pickup_state, pickup_zip, delivery_radius_miles, weekly_delivery_windows')
            .eq('owner_id', user.id)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)

          const booth = userBooths?.[0]
          if (booth) {
            setExistingBoothId(booth.id)
            if (booth.name && booth.name !== 'My Booth' && booth.name !== 'My Stand') {
              if (!authName) setAuthName(booth.name)
            }
            
            // Only prefill fulfillment toggles if user has NOT already edited them in the active session
            if (!hasUserEditedFulfillmentRef.current) {
              if (booth.offers_delivery !== null) setOffersDelivery(booth.offers_delivery)
              if (booth.offers_pickup !== null) setOffersPickup(booth.offers_pickup)
              
              // Prefill pickup address
              setPickupAddr({
                street: booth.pickup_street || '',
                city: booth.pickup_city || '',
                state: booth.pickup_state || '',
                zip: booth.pickup_zip || ''
              })

              // Prefill delivery options
              if (booth.delivery_radius_miles) {
                setDeliveryRadius(booth.delivery_radius_miles)
              }
              if (booth.delivery_zipcodes && booth.delivery_zipcodes.length > 0) {
                setZipcode(booth.delivery_zipcodes[0])
                setZipInput(booth.delivery_zipcodes.join(', '))
                setDeliveryZipcodes(booth.delivery_zipcodes)
              } else if (booth.booth_zip) {
                setZipcode(booth.booth_zip)
                setZipInput(booth.booth_zip)
                setDeliveryZipcodes([booth.booth_zip])
              }
            }
            return
          }
        } catch (err) {
          console.warn('Error loading booth:', err)
        }
      }

      // Guest / New User: fetch IP location from Vercel edge header endpoint if no URL zip provided
      const queryZip = searchParams.get('zipcode') || searchParams.get('zip') || ''
      if (!queryZip && !zipcode) {
        try {
          const res = await fetch('/api/location/ip')
          if (res.ok) {
            const data = await res.json()
            const detectedZip = data.zip || data.zipcode || ''
            if (detectedZip) {
              setZipcode(detectedZip)
            }
          }
        } catch {
          /* ignore network error */
        }
      }
    }


    loadLocationOrBooth()
  }, [user, supabase])


  // ── 3. Geolocation Helpers ──
  const handleGeolocate = async (type: 'delivery' | 'pickup') => {
    if (!navigator.geolocation) return
    const setGeolocating = type === 'delivery' ? setGeolocatingDelivery : setGeolocatingPickup
    setGeolocating(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`
          )
          if (res.ok) {
            const data = await res.json()
            const addr = data.address || {}
            const houseNumber = addr.house_number || ''
            const road = addr.road || ''
            const stateVal = addr.state || ''
            let mappedState = ''
            if (stateVal) {
              const cleanState = stateVal.trim()
              if (cleanState.length === 2) {
                mappedState = cleanState.toUpperCase()
              } else {
                mappedState = cleanState.substring(0, 2).toUpperCase()
              }
            }
            const rawPostcode = addr.postcode || ''
            const cleanZip = rawPostcode.match(/\b\d{5}\b/)?.[0] || rawPostcode

            const newAddr: AddressFields = {
              street: `${houseNumber} ${road}`.trim(),
              city: addr.city || addr.town || addr.village || '',
              state: mappedState,
              zip: cleanZip,
            }

            if (type === 'delivery') {
              setDeliveryBaseAddr(newAddr)
              if (cleanZip) {
                setZipInput(cleanZip)
                setZipcode(cleanZip)
                setDeliveryZipcodes([cleanZip])
              }
            } else {
              setPickupAddr(newAddr)
              if (cleanZip && !zipcode) {
                setZipcode(cleanZip)
              }
            }
          }
        } catch (e) {
          console.warn('Geocoding failed:', e)
        } finally {
          setGeolocating(false)
        }
      },
      () => setGeolocating(false)
    )
  }

  // ── 4. Abandonment Tracking ──
  const trackAbandonment = useCallback(() => {
    if (isSubmittedRef.current || hasAbandoned.current) return
    hasAbandoned.current = true
    const duration = Math.min(Math.round((Date.now() - stepEnteredAt.current) / 1000), 900)
    if (duration > 1) {
      trackStepTiming(PAGE_SLUG, 1, 'bulk_grid', duration)
      trackEvent('wizard_abandon', PAGE_SLUG, {
        step_index: 1,
        step_name: 'bulk_grid',
        duration_seconds: duration,
        produce_count: produceRows.length,
      })
    }
  }, [produceRows.length])

  useEffect(() => {
    const handleBeforeUnload = () => trackAbandonment()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      trackAbandonment()
    }
  }, [trackAbandonment])

  // ── 5. Produce Row Manipulation ──
  const handleAddRow = () => {
    const newRow = createRowFromProduceName('', `manual_row_${Date.now()}`)
    setProduceRows(prev => [...prev, newRow])
    trackEvent('button_click', PAGE_SLUG, { action: 'add_row' })
  }

  const handleRemoveRow = (rowId: string) => {
    setProduceRows(prev => prev.filter(r => r.id !== rowId))
    setRowErrors(prev => {
      const next = { ...prev }
      delete next[rowId]
      return next
    })
    trackEvent('button_click', PAGE_SLUG, { action: 'remove_row', rowId })
  }

  const handleUpdateRow = (rowId: string, updates: Partial<ProduceRowItem>) => {
    // Track manual price edits — if user explicitly types a price, don't auto-update it later
    if (updates.priceUsd !== undefined) {
      userModifiedPriceRowIds.current.add(rowId)
    }

    // Capture whether we need to re-fetch price for a unit change (before state update)
    let unitChangeRequest: { rowName: string; newUnit: string } | null = null

    setProduceRows(prev =>
      prev.map(row => {
        if (row.id !== rowId) return row

        const updated = { ...row, ...updates }

        // If produce name or category changed, auto-resolve stock photo & default unit
        if (updates.name !== undefined && updates.name !== row.name) {
          const trimmed = updates.name.trim()
          if (!trimmed) {
            updated.stockImage = ''
            updated.catalogItemId = null
          } else {
            const matched = EXHAUSTIVE_INTERESTS_CATALOG.find(
              c => c.name.toLowerCase() === trimmed.toLowerCase() || c.id.toLowerCase() === trimmed.toLowerCase()
            )
            const base = extractBaseProduce(trimmed)
            if (matched) {
              updated.stockImage = matched.image || getProduceImage(trimmed) || ''
              if (matched.unit && ALLOWED_UNITS.includes(matched.unit) && !row.unit) {
                updated.unit = matched.unit
              }
              if (matched.category && !row.category) {
                updated.category = matched.category
              }
              updated.catalogItemId = matched.id
            } else if (base?.name) {
              updated.stockImage = base.image || getProduceImage(trimmed) || ''
              if (base.unit && ALLOWED_UNITS.includes(base.unit) && !row.unit) {
                updated.unit = base.unit
              }
              if (base.category && !row.category) {
                updated.category = base.category
              }
            } else {
              updated.stockImage = ''
            }
          }

          // Content Moderation check on Name
          const modCheck = checkTextForViolations(trimmed)
          if (!modCheck.isClean) {
            setRowErrors(errs => ({ ...errs, [rowId]: modCheck.error || 'Prohibited term detected' }))
          } else {
            setRowErrors(errs => {
              const next = { ...errs }
              delete next[rowId]
              return next
            })
          }
        }

        // Content Moderation check on Description
        if (updates.description !== undefined && updates.description !== row.description) {
          const modCheck = checkTextForViolations(updates.description)
          if (!modCheck.isClean) {
            setRowErrors(errs => ({ ...errs, [rowId]: modCheck.error || 'Prohibited term in description' }))
          } else if (!rowErrors[rowId]?.includes('Prohibited')) {
            setRowErrors(errs => {
              const next = { ...errs }
              delete next[rowId]
              return next
            })
          }
        }

        // If unit changed and user hasn't manually edited the price, convert price to new unit
        if (updates.unit !== undefined && updates.unit !== row.unit && !userModifiedPriceRowIds.current.has(rowId)) {
          const currPrice = parseFloat(row.priceUsd)
          if (!isNaN(currPrice) && currPrice > 0) {
            const converted = convertPrice(currPrice, row.unit, updates.unit)
            updated.priceUsd = converted.toFixed(2)
          }
        }

        // Auto-check only when user explicitly enters BOTH price (or Free) AND quantity
        const hasPrice = updated.isFree || (parseFloat(updated.priceUsd) > 0)
        const hasQty = (parseInt(updated.quantity, 10) || 0) > 0

        if (updates.isSelected !== undefined) {
          updated.isSelected = updates.isSelected
        } else if (hasPrice && hasQty && updated.name.trim().length > 0) {
          updated.isSelected = true
        } else if (updates.priceUsd !== undefined || updates.quantity !== undefined || updates.isFree !== undefined) {
          if (!hasPrice || !hasQty) {
            updated.isSelected = false
          }
        }

        return updated
      })
    )
  }




  // ── Select All / Deselect All Helper ──
  const allSelected = useMemo(() => {
    return produceRows.length > 0 && produceRows.every(r => r.isSelected)
  }, [produceRows])

  const handleToggleSelectAll = () => {
    const nextState = !allSelected
    setProduceRows(prev =>
      prev.map(r => ({
        ...r,
        isSelected: nextState,
        quantity: nextState && !r.quantity ? '5' : r.quantity,
      }))
    )
    trackEvent('button_click', PAGE_SLUG, { action: nextState ? 'select_all_rows' : 'deselect_all_rows' })
  }

  // ── 6. Photo Capture & Upload ──
  const handlePhotoCaptured = (result: CaptureResult) => {
    if (!activeCameraRowId || !result.file) return
    const rowId = activeCameraRowId
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      handleUpdateRow(rowId, { customPhotoDataUrl: dataUrl, isSelected: true })
    }
    reader.readAsDataURL(result.file)
    setActiveCameraRowId(null)
    trackEvent('button_click', PAGE_SLUG, { action: 'camera_capture_complete' })
  }

  const triggerFileUpload = (rowId: string) => {
    setUploadTargetRowId(rowId)
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadTargetRowId) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      handleUpdateRow(uploadTargetRowId, { customPhotoDataUrl: dataUrl, isSelected: true })
      setUploadTargetRowId(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsDataURL(file)
  }

  // ── 7. Save Draft & Form Validation ──
  const saveDraftToStorage = () => {
    if (typeof window === 'undefined') return
    const draft = {
      produceRows,
      offersDelivery,
      offersPickup,
      zipcode,
      deliveryMode,
      deliveryBaseAddr,
      deliveryRadius,
      deliveryZipcodes,
      deliveryPreset,
      pickupAddr,
      pickupPreset,
    }
    localStorage.setItem('casagrown_bulk_listing_draft', JSON.stringify(draft))
  }

  // ── 8. Form Validation & Publishing Pipeline ──
  const selectedCount = useMemo(() => {
    return produceRows.filter(r => r.isSelected).length
  }, [produceRows])

  const validFilledRows = useMemo(() => {
    return produceRows.filter(r => {
      if (!r.isSelected) return false
      const hasName = r.name.trim().length > 0
      const hasQty = (parseInt(r.quantity, 10) || 0) > 0
      const hasPrice = r.isFree || (parseFloat(r.priceUsd) || 0) > 0
      const hasNoError = !rowErrors[r.id]
      return hasName && hasQty && hasPrice && hasNoError
    })
  }, [produceRows, rowErrors])

  const isFulfillmentValid = useMemo(() => {
    if (!offersDelivery && !offersPickup) return false

    if (offersDelivery) {
      if (deliveryMode === 'zipcode') {
        const hasZip = deliveryZipcodes.length > 0 || /^\d{5}$/.test(zipInput.trim())
        if (!hasZip) return false
      } else if (deliveryMode === 'address_radius') {
        const hasBaseAddr = isAddressComplete(deliveryBaseAddr)
        const hasRadius = deliveryRadius > 0
        if (!hasBaseAddr || !hasRadius) return false
      }
    }

    if (offersPickup) {
      const hasPickup = isAddressComplete(pickupAddr)
      if (!hasPickup) return false
    }

    return true
  }, [offersDelivery, offersPickup, deliveryMode, deliveryZipcodes, zipInput, deliveryBaseAddr, deliveryRadius, pickupAddr])

  const publishButtonHint = useMemo(() => {
    if (validFilledRows.length === 0) {
      return 'Fill in price & quantity for at least 1 item'
    }
    if (!offersDelivery && !offersPickup) {
      return '⚠️ Please select at least 1 fulfillment option (Delivery, Pickup, or Both)'
    }
    if (offersDelivery && deliveryMode === 'zipcode' && deliveryZipcodes.length === 0 && !/^\d{5}$/.test(zipInput.trim())) {
      return '⚠️ Please enter at least one 5-digit delivery ZIP code below'
    }
    if (offersDelivery && deliveryMode === 'address_radius' && !isAddressComplete(deliveryBaseAddr)) {
      return '⚠️ Please enter your complete home/farm address for delivery radius below'
    }
    if (offersPickup && !isAddressComplete(pickupAddr)) {
      return '⚠️ Please enter your complete pickup address below'
    }
    return 'Free to list • Instant seller booth setup'
  }, [validFilledRows.length, offersDelivery, offersPickup, deliveryMode, deliveryZipcodes, zipInput, deliveryBaseAddr, pickupAddr])

  const validateStep2Form = (isEmailOtpFlow: boolean = false): Record<string, string> => {
    const errs: Record<string, string> = {}

    if (!offersDelivery && !offersPickup) {
      errs.fulfillment = '⚠️ Please select at least one fulfillment option (Delivery or Pickup).'
    }

    if (offersDelivery) {
      if (deliveryMode === 'address_radius') {
        if (!isAddressComplete(deliveryBaseAddr)) {
          errs.delivery_zip = '⚠️ Please enter your complete street address, city, state, and ZIP for the delivery radius.'
        }
      } else {
        const hasValidZip = deliveryZipcodes.length > 0 || !!zipInput.match(/\b\d{5}\b/g) || (zipcode && /^\d{5}$/.test(zipcode))
        if (!hasValidZip) {
          errs.delivery_zip = '⚠️ Please enter a 5-digit delivery ZIP code where you can deliver.'
        }

      }
    }

    if (offersPickup) {
      if (!pickupAddr.street.trim() || !pickupAddr.zip.trim()) {
        errs.pickup_addr = '⚠️ Please enter your pickup street address and ZIP code.'
      }
    }

    if (!agreedTos) {
      errs.tos = '⚠️ Please agree to the Terms of Service & Privacy Policy by checking the box below.'
    }

    if (isEmailOtpFlow) {
      if (!authName.trim()) {
        errs.stand_name = '⚠️ Please enter your name.'
      }
      if (!authEmail.trim() || !authEmail.includes('@')) {
        errs.email = '⚠️ Please enter a valid email address to receive your verification code.'
      }
    }

    return errs
  }

  const scrollToFirstError = (errs: Record<string, string>) => {
    if (typeof document === 'undefined') return
    if (errs.fulfillment || errs.delivery_zip) {
      document.getElementById('delivery-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (errs.pickup_addr) {
      document.getElementById('pickup-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (errs.stand_name) {
      const el = document.getElementById('auth-name-input')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus()
    } else if (errs.tos) {
      document.getElementById('tos-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (errs.email) {
      const el = document.getElementById('auth-email-input')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus()
    }
  }

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    setGlobalError('')
    setAuthError('')
    const errs = validateStep2Form(false)
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      scrollToFirstError(errs)
      return
    }

    saveDraftToStorage()
    trackEvent('button_click', PAGE_SLUG, { action: `social_login_${provider}` })

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com'
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${origin}/api/auth/callback?redirect=${encodeURIComponent('/list_bulk?autostart=1')}`,
      },
    })
    if (error) {
      setAuthError(error.message || `Failed to sign in with ${provider}. Please try again.`)
    }
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault()
    setGlobalError('')
    setAuthError('')

    const errs = validateStep2Form(true)
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      scrollToFirstError(errs)
      return
    }

    setIsSendingOtp(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          data: {
            full_name: authName.trim() || 'Seller',
            phone: authPhone.trim(),
            tos_accepted: true,
            agreed_to_tos: true,
          },
        },
      })

      if (error) throw error
      setModalStep('otp')
      trackEvent('wizard_step', PAGE_SLUG, { step_index: 2, step_name: 'otp_verification' })
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to send verification code. Please try again.')
    } finally {
      setIsSendingOtp(false)
    }
  }

  interface FulfillmentSnapshot {
    offersDelivery: boolean
    offersPickup: boolean
    deliveryMode: 'zipcode' | 'address_radius'
    deliveryRadius: number
    deliveryBaseAddr: AddressFields
    zipcode: string
    zipInput: string
    deliveryZipcodes: string[]
    pickupAddr: AddressFields
  }

  const captureFulfillmentSnapshot = (): FulfillmentSnapshot => ({
    offersDelivery,
    offersPickup,
    deliveryMode,
    deliveryRadius,
    deliveryBaseAddr,
    zipcode,
    zipInput,
    deliveryZipcodes,
    pickupAddr,
  })

  const handleVerifyOtp = async (e: React.FormEvent) => {

    if (e && e.preventDefault) e.preventDefault()
    setGlobalError('')
    setAuthError('')

    if (!authOtp.trim() || authOtp.trim().length < 6) {
      setGlobalError('⚠️ Please enter the complete 6-digit code sent to your email.')
      return
    }

    setIsVerifyingOtp(true)
    // Capture fulfillment state NOW before any async operations or re-renders
    const fulfillmentSnap = captureFulfillmentSnapshot()
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: authEmail.trim().toLowerCase(),
        token: authOtp.trim(),
        type: 'email',
      })

      if (error) throw error
      if (data.user) {
        // Set the published guard BEFORE any await so loadLocationOrBooth
        // cannot fire and overwrite the user's fulfillment choices with DB defaults.
        hasPublishedRef.current = true

        setVerifiedUserId(data.user.id)
        setAgreedTos(true)
        setGlobalError('')
        trackEvent('wizard_step', PAGE_SLUG, { step_index: 3, step_name: 'review_and_tos' })

        // Flush the auth session into the Supabase client so auth.uid() works
        // in the create_stand RPC. onAuthStateChange already handles user state.
        if (data.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          })
        }
        if (authName.trim()) {
          await supabase.from('profiles').update({ full_name: authName.trim() }).eq('id', data.user.id)
          await supabase.auth.updateUser({ data: { full_name: authName.trim(), tos_accepted: true, agreed_to_tos: true } })
        }
        await refreshAuth()
        await executePublish(data.user.id, fulfillmentSnap)
      }


    } catch (err: any) {
      setGlobalError(err?.message || 'Invalid or expired code. Please try again.')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const handlePublishClick = async () => {
    setGlobalError('')

    // Auto-commit any valid 5-digit ZIP currently in zipInput
    let currentZipcodes = [...deliveryZipcodes]
    if (zipInput.trim().length === 5 && /^\d{5}$/.test(zipInput.trim()) && !currentZipcodes.includes(zipInput.trim())) {
      currentZipcodes.push(zipInput.trim())
      setDeliveryZipcodes(currentZipcodes)
      if (!zipcode) setZipcode(zipInput.trim())
      setZipInput('')
    }

    // ── FIRE ANALYTICS EVENTS FOR ALL FIELDS ──
    trackEvent('button_click', PAGE_SLUG, { action: 'publish_intent' })
    trackFieldInteract(PAGE_SLUG, 1, 'offers_delivery', offersDelivery)
    trackFieldInteract(PAGE_SLUG, 1, 'offers_pickup', offersPickup)
    if (offersDelivery) {
      trackFieldInteract(PAGE_SLUG, 1, 'delivery_mode', !!deliveryMode)
      if (deliveryMode === 'zipcode') {
        trackFieldInteract(PAGE_SLUG, 1, 'delivery_zipcodes', currentZipcodes.length > 0 || !!zipcode.trim())
      } else {
        trackFieldInteract(PAGE_SLUG, 1, 'delivery_base_street', !!deliveryBaseAddr.street.trim())
        trackFieldInteract(PAGE_SLUG, 1, 'delivery_base_city', !!deliveryBaseAddr.city.trim())
        trackFieldInteract(PAGE_SLUG, 1, 'delivery_base_state', !!deliveryBaseAddr.state.trim())
        trackFieldInteract(PAGE_SLUG, 1, 'delivery_base_zip', !!deliveryBaseAddr.zip.trim())
        trackFieldInteract(PAGE_SLUG, 1, 'delivery_radius', !!deliveryRadius)
      }
      trackFieldInteract(PAGE_SLUG, 1, 'delivery_preset', !!deliveryPreset)
    }
    if (offersPickup) {
      trackFieldInteract(PAGE_SLUG, 1, 'pickup_street', !!pickupAddr.street.trim())
      trackFieldInteract(PAGE_SLUG, 1, 'pickup_city', !!pickupAddr.city.trim())
      trackFieldInteract(PAGE_SLUG, 1, 'pickup_state', !!pickupAddr.state.trim())
      trackFieldInteract(PAGE_SLUG, 1, 'pickup_zip', !!pickupAddr.zip.trim())
      trackFieldInteract(PAGE_SLUG, 1, 'pickup_preset', !!pickupPreset)
    }
    produceRows.forEach((r, idx) => {
      trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_name`, !!r.name.trim())
      trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_price`, !!r.priceUsd.trim() || r.isFree)
      trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_qty`, !!r.quantity.trim())
      trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_selected`, r.isSelected)
    })
    // ── END ANALYTICS ──

    const selectedCount = produceRows.filter(r => r.isSelected).length
    if (selectedCount === 0) {
      setGlobalError('Please select at least one produce item (check the box and set a price).')
      return
    }

    if (validFilledRows.length === 0) {
      setGlobalError('Please ensure your selected items have a price (or Free) and a valid quantity.')
      return
    }

    if (Object.keys(rowErrors).length > 0) {
      setGlobalError('Please resolve all prohibited content violations highlighted in red.')
      return
    }

    if (!offersDelivery && !offersPickup) {
      setGlobalError('Please select at least one fulfillment option (Delivery, Pickup, or Both).')
      return
    }

    if (offersDelivery && deliveryMode === 'zipcode' && currentZipcodes.length === 0) {
      setGlobalError('Please enter at least one valid 5-digit delivery ZIP code.')
      return
    }

    if (offersDelivery && deliveryMode === 'address_radius' && !isAddressComplete(deliveryBaseAddr)) {
      setGlobalError('Please enter a complete street address, city, state, and 5-digit ZIP code for your delivery base.')
      return
    }

    if (offersPickup && !isAddressComplete(pickupAddr)) {
      setGlobalError('Please provide a complete street address, city, state, and 5-digit ZIP code for pickup hand-offs.')
      return
    }

    saveDraftToStorage()

    // If user is already authenticated:
    if (isAuthenticated && user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, tos_accepted_at, phone_number')
        .eq('id', user.id)
        .maybeSingle()

      if (prof?.tos_accepted_at && prof?.full_name?.trim()) {
        await executePublish(user.id, captureFulfillmentSnapshot())
        return
      } else {
        if (prof?.full_name) setAuthName(prof.full_name)
        if (prof?.phone_number) setAuthPhone(prof.phone_number)
        setVerifiedUserId(user.id)
        setModalStep('review')
        setPublishModalOpen(true)
        return
      }
    }

    // Guest user -> Open Step 1 (Contact + Auth)
    setAuthEmail('')
    setAuthOtp('')
    setAuthError('')
    setModalStep('contact')
    setPublishModalOpen(true)
  }

  const handleFinalPublishSubmit = async (e: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault()
    setGlobalError('')
    setAuthError('')

    // Capture fulfillment state NOW before any async operations or re-renders
    const fulfillmentSnap = captureFulfillmentSnapshot()

    const errs = validateStep2Form(false)
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      scrollToFirstError(errs)
      return
    }

    const targetUserId = verifiedUserId || user?.id

    if (!targetUserId) {
      setAuthError('User authentication not found. Please try again.')
      return
    }

    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()
      const finalZip =
        zipcode.trim() ||
        deliveryBaseAddr.zip.trim() ||
        pickupAddr.zip.trim() ||
        '94024'

      const profilePayload: any = {
        full_name: authName.trim() || undefined,
        tos_accepted_at: now,
        profile_completed_at: now,
        sms_enabled: smsConsent,
        zip_code: finalZip,
      }
      if (authPhone.trim()) {
        profilePayload.phone_number = authPhone.trim().startsWith('+')
          ? authPhone.trim()
          : `+1${authPhone.trim().replace(/\D/g, '')}`
      }

      const { error: updateErr } = await supabase
        .from('profiles')
        .update(profilePayload)
        .eq('id', targetUserId)

      if (updateErr) console.error('[AUTH] profiles update error:', updateErr)

      await supabase.auth.updateUser({
        data: {
          full_name: authName.trim() || undefined,
          tos_accepted: true,
          agreed_to_tos: true,
          agreed_to_tos_at: now,
        },
      })

      // Track Lead
      try {
        trackMetaLead('list_bulk')
      } catch (crmEx) {
        console.warn('CRM lead tracking warn:', crmEx)
      }

      setPublishModalOpen(false)
      await refreshAuth()

      // Execute publish with the snapshot captured before async operations
      await executePublish(targetUserId, fulfillmentSnap)

    } catch (err: any) {
      setAuthError(err?.message || 'Failed to complete setup. Please try again.')
      setIsSubmitting(false)
    }

  }



  const executePublish = async (userId: string, snapshot?: FulfillmentSnapshot) => {
    // Use the explicit snapshot if provided, otherwise capture current state.
    const snap = snapshot || captureFulfillmentSnapshot()

    hasPublishedRef.current = true
    setIsSubmitting(true)
    setGlobalError('')

    try {
      // 1. Resolve or Create Stand / Booth
      let targetBoothId = existingBoothId


      const finalZip =
        snap.zipcode.trim() ||
        snap.deliveryBaseAddr.zip.trim() ||
        snap.pickupAddr.zip.trim() ||
        '94024'


      const deliveryWindows = deliveryPreset === 'custom' 
        ? customDeliveryWindows 
        : getWindowsForPreset(deliveryPreset)

      const pickupWindows = pickupPreset === 'custom' 
        ? customPickupWindows 
        : getWindowsForPreset(pickupPreset)

      const DAY_INDEX_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

      const convertToWeeklyWindows = (windowsRecord: Record<string, string[]>) => {
        const weekly: Record<string, string[]> = {}
        for (const [key, slots] of Object.entries(windowsRecord)) {
          if (!Array.isArray(slots) || slots.length === 0) continue
          let dayKey = key.toLowerCase().slice(0, 3)
          if (key.includes('-') && key.length >= 8) {
            const [y, m, d] = key.split('-').map(Number)
            const dateObj = new Date(y, m - 1, d)
            dayKey = DAY_INDEX_TO_KEY[dateObj.getDay()] || 'mon'
          }
          if (!weekly[dayKey]) weekly[dayKey] = []
          for (const slot of slots) {
            if (!weekly[dayKey].includes(slot)) {
              weekly[dayKey].push(slot)
            }
          }
        }
        return weekly
      }

      const generateFulfillmentWindowRows = (
        boothId: string,
        windowType: 'delivery' | 'pickup',
        weeklyWindows: Record<string, string[]>
      ) => {
        const rows: { booth_id: string; window_type: string; day_of_week: string; start_time: string; end_time: string }[] = []
        for (const [day, slots] of Object.entries(weeklyWindows)) {
          for (const slot of slots) {
            if (slot.startsWith('custom-')) {
              const parts = slot.replace('custom-', '').split('-')
              if (parts.length >= 2) {
                rows.push({ booth_id: boothId, window_type: windowType, day_of_week: day, start_time: parts[0], end_time: parts[1] })
              }
            } else {
              const [startH, endH] = slot.split('-').map(Number)
              if (!isNaN(startH) && !isNaN(endH)) {
                rows.push({
                  booth_id: boothId,
                  window_type: windowType,
                  day_of_week: day,
                  start_time: `${String(startH).padStart(2, '0')}:00`,
                  end_time: `${String(endH).padStart(2, '0')}:00`
                })
              }
            }
          }
        }
        return rows
      }

      const weeklyDeliveryWindows = snap.offersDelivery ? convertToWeeklyWindows(deliveryWindows) : null
      const weeklyPickupWindows = snap.offersPickup ? convertToWeeklyWindows(pickupWindows) : null


      if (!targetBoothId) {
        // Find existing default or primary booth for this user
        const { data: userBooths } = await supabase
          .from('market_booths')
          .select('id, is_default, booth_zip')
          .eq('owner_id', userId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)

        if (userBooths && userBooths.length > 0) {
          targetBoothId = userBooths[0]!.id
        }
      }

      // Resolve seller's name from profile
      let sellerName = ''
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle()
      if (prof?.full_name?.trim()) sellerName = prof.full_name.trim()

      const standName = sellerName ? `${sellerName}'s Produce Stand` : 'My Backyard Produce Stand'
      const inputZips = snap.zipInput.match(/\b\d{5}\b/g) || []
      const resolvedDeliveryZipcodes = inputZips.length > 0 ? Array.from(new Set(inputZips)) : snap.deliveryZipcodes
      const hasBaseAddress = isAddressComplete(snap.deliveryBaseAddr) || (snap.deliveryBaseAddr.street.trim().length > 0 && snap.deliveryBaseAddr.zip.trim().length > 0)
      const deliveryRadiusValue = (snap.offersDelivery && snap.deliveryMode === 'address_radius' && hasBaseAddress) ? (snap.deliveryRadius || 5) : null
      const deliveryZipcodesValue = snap.offersDelivery && resolvedDeliveryZipcodes.length > 0 ? resolvedDeliveryZipcodes : (snap.offersDelivery && finalZip ? [finalZip] : null)
      const pickupStr = snap.offersPickup && isAddressComplete(snap.pickupAddr) ? formatFullAddress(snap.pickupAddr) : null
      const pickupAddressValue = snap.offersPickup && pickupStr ? pickupStr : null

      if (!targetBoothId) {
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('create_stand', {
            p_name: standName,
            p_pickup_address: pickupAddressValue,
            p_offers_delivery: snap.offersDelivery,
            p_offers_pickup: snap.offersPickup,
            p_delivery_radius_miles: deliveryRadiusValue,
            p_delivery_zipcodes: deliveryZipcodesValue || [],
            p_is_default: true,
          })

          if (!rpcErr && rpcData) {
            targetBoothId = typeof rpcData === 'string' ? rpcData : (rpcData as any)?.id || rpcData
          }
        } catch (rpcEx) {
          console.warn('create_stand RPC warning:', rpcEx)
        }


        if (!targetBoothId) {
          const { data: newBooth, error: boothErr } = await supabase
            .from('market_booths')
            .insert({
              owner_id: userId,
              name: standName,
              offers_delivery: snap.offersDelivery,
              offers_pickup: snap.offersPickup,
              delivery_radius_miles: deliveryRadiusValue,
              delivery_zipcodes: deliveryZipcodesValue,
              pickup_address: pickupAddressValue,
              weekly_delivery_windows: weeklyDeliveryWindows,
              weekly_pickup_windows: weeklyPickupWindows,
              status: 'published',
              is_default: true,

            })
            .select('id')
            .single()

          if (newBooth?.id) {
            targetBoothId = newBooth.id
          } else {
            console.warn('Booth direct insert warning:', boothErr)
            const { data: fallbackBooths } = await supabase
              .from('market_booths')
              .select('id')
              .eq('owner_id', userId)
              .order('is_default', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(1)
            if (fallbackBooths && fallbackBooths.length > 0) {
              targetBoothId = fallbackBooths[0]!.id
            }
          }
        }
      }

      if (!targetBoothId) {
        throw new Error('Could not create or resolve seller stand. Please try again.')
      }

      // Update existing booth with active fulfillment settings and active status

      const boothUpdatePayload = {
        offers_delivery: snap.offersDelivery,
        offers_pickup: snap.offersPickup,
        delivery_radius_miles: deliveryRadiusValue,
        delivery_zipcodes: deliveryZipcodesValue,
        pickup_address: pickupAddressValue,
        weekly_delivery_windows: weeklyDeliveryWindows,
        weekly_pickup_windows: weeklyPickupWindows,
        status: 'published' as const,
      }

      const { error: boothUpdateErr, count: boothUpdateCount } = await supabase
        .from('market_booths')
        .update(boothUpdatePayload)
        .eq('id', targetBoothId)


      // Sync relational booth_fulfillment_windows
      try {
        await supabase
          .from('booth_fulfillment_windows')
          .delete()
          .eq('booth_id', targetBoothId)

        const windowRows: { booth_id: string; window_type: string; day_of_week: string; start_time: string; end_time: string }[] = []
        if (snap.offersDelivery && weeklyDeliveryWindows) {
          windowRows.push(...generateFulfillmentWindowRows(targetBoothId, 'delivery', weeklyDeliveryWindows))
        }
        if (snap.offersPickup && weeklyPickupWindows) {

          windowRows.push(...generateFulfillmentWindowRows(targetBoothId, 'pickup', weeklyPickupWindows))
        }
        if (windowRows.length > 0) {
          const { error: winErr } = await supabase
            .from('booth_fulfillment_windows')
            .insert(windowRows)
          if (winErr) console.warn('booth_fulfillment_windows insert warning:', winErr)
        }
      } catch (winEx) {
        console.warn('Fulfillment window sync warning:', winEx)
      }

      // Format product-level fulfillment schedule windows matching the marketplace schema
      const formatProductWindows = (windowsRecord: Record<string, string[]>) => {
        const obj: Record<string, any[]> = {}
        for (const [dateKey, slotIds] of Object.entries(windowsRecord)) {
          if (Array.isArray(slotIds) && slotIds.length > 0) {
            obj[dateKey] = slotIds.map(id => {
              const [start] = id.split('-')
              const startNum = parseInt(start, 10) || 8
              return {
                id,
                start: `${startNum}:00`,
                end: `${startNum + 2}:00`,
              }
            })
          }
        }
        return Object.keys(obj).length > 0 ? obj : null
      }

      const formattedDeliveryWindows = snap.offersDelivery ? formatProductWindows(deliveryWindows) : null
      const formattedPickupWindows = snap.offersPickup ? formatProductWindows(pickupWindows) : null

      const activeWindowDates = dayOptions.map(d => d.date)
      const today = new Date()
      const marketDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

      let expiresAt: string | null = null
      if (activeWindowDates.length > 0) {
        const maxDateStr = activeWindowDates.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
        const maxDate = new Date(maxDateStr + 'T23:59:59')
        maxDate.setDate(maxDate.getDate() + 1)
        expiresAt = maxDate.toISOString()
      } else {
        const d = new Date()
        d.setDate(d.getDate() + 7)
        expiresAt = d.toISOString()
      }

      const productsToInsert = []
      for (let i = 0; i < validFilledRows.length; i++) {
        const row = validFilledRows[i]!
        const parsedPrice = row.isFree ? 0 : parseFloat(row.priceUsd) || 0
        const parsedQty = parseInt(row.quantity, 10) || 1
        let photoUrl = row.stockImage || null

        // If custom image data URL, upload to product-photos storage bucket
        if (row.customPhotoDataUrl && row.customPhotoDataUrl.startsWith('data:')) {
          try {
            const res = await fetch(row.customPhotoDataUrl)
            const blob = await res.blob()
            const ext = blob.type.includes('png') ? 'png' : 'jpg'
            const path = `${userId}/${Date.now()}_${i}.${ext}`
            const { error: uploadErr } = await supabase.storage.from('product-photos').upload(path, blob, { upsert: true })
            if (!uploadErr) {
              const { data: urlData } = supabase.storage.from('product-photos').getPublicUrl(path)
              if (urlData?.publicUrl) photoUrl = urlData.publicUrl
            }
          } catch (uploadEx) {
            console.warn('Custom photo upload exception:', uploadEx)
          }
        } else if (row.customPhotoDataUrl) {
          photoUrl = row.customPhotoDataUrl
        }

        const prodItem: Record<string, any> = {
          seller_id: userId,
          booth_id: targetBoothId,
          market_date: marketDate,
          name: row.name.trim(),
          description: row.description.trim() || `Fresh homegrown ${row.name.trim().replace(/^fresh\s+/i, '')}`,
          price_usd: parsedPrice,
          unit: row.unit || 'lb',
          inventory: parsedQty,
          category: row.category || 'produce',
          photos: photoUrl ? [photoUrl] : [],
          is_active: true,
          is_draft: false,
          is_deleted: false,
          harvested_at: row.harvestedAt ? new Date(row.harvestedAt + 'T12:00:00').toISOString() : null,
          expires_at: expiresAt,
          delivery_radius_miles: deliveryRadiusValue,
          pickup_address: pickupAddressValue,
          delivery_zipcodes: deliveryZipcodesValue,
          product_delivery_windows: formattedDeliveryWindows,
          product_pickup_windows: formattedPickupWindows,
          window_dates: activeWindowDates,
        }

        productsToInsert.push(prodItem)
      }

      const { data: createdProducts, error: prodErr } = await supabase
        .from('market_products')
        .insert(productsToInsert)
        .select('id, name, description, photos')

      if (prodErr) {
        console.error('Product insert error details:', {
          message: prodErr.message,
          details: prodErr.details,
          hint: prodErr.hint,
          code: prodErr.code,
        })
        throw new Error(prodErr.message || 'Failed to create products in database')
      }

      // 3. Trigger Background Content Moderation & Auto-Post to Community
      if (createdProducts && createdProducts.length > 0) {
        const boothAddrStr = formatFullAddress(snap.deliveryBaseAddr)
        const fallbackAddr = boothAddrStr || finalZip
        const pickupStr = formatFullAddress(snap.pickupAddr)


        for (const prod of createdProducts) {
          supabase.functions
            .invoke('moderate-listing', {
              body: {
                product_id: prod.id,
                seller_id: userId,
                name: prod.name,
                description: prod.description,
                photos: prod.photos,
              },
            })
            .catch((err: any) => console.warn('Background moderation error:', err))

          // Auto-post to local /community feed
          const rowInfo = validFilledRows.find(r => r.name.trim().toLowerCase() === prod.name.trim().toLowerCase())
          autoPostProductToCommunity({
            supabase,
            userId,
            productId: prod.id,
            productName: prod.name,
            priceUsd: rowInfo?.priceUsd || 0,
            unit: rowInfo?.unit || 'each',
            fallbackAddress: fallbackAddr,
            secondaryFallbackAddress: pickupStr || null,
            geocodeFn: geocodeAddress,
          }).catch((err: any) => console.warn('[AutoPost] Bulk product auto-post warning:', err))
        }
      }

      // 4. Create Implicit Sell Interests in CRM
      try {
        const interestRecords = validFilledRows.map(row => ({
          user_id: userId,
          produce_name: row.name.trim().toLowerCase(),
          produce_category: row.category || 'produce',
          interest_type: 'sell',
          zipcodes: finalZip ? [finalZip] : [],
        }))

        await supabase.from('crm_produce_interests').insert(interestRecords)
      } catch (interestErr: any) {
        console.warn('Implicit sell interests sync warning:', interestErr)
      }

      // 5. Complete Step Analytics
      isSubmittedRef.current = true
      trackEvent('button_click', PAGE_SLUG, {
        action: 'bulk_publish_complete',
        produce_count: validFilledRows.length,
        booth_id: targetBoothId,
      })

      // 6. Ensure profile is marked completed and refreshed so OnboardingGate never re-prompts
      try {
        const now = new Date().toISOString()
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({
            tos_accepted_at: now,
            profile_completed_at: now,
          })
          .eq('id', userId)

        if (updateErr) console.error('[AUTH] profile completion update error:', updateErr)
        await refreshAuth()
      } catch (profEx) {
        console.warn('Profile completion sync warning:', profEx)
      }

      if (typeof window !== 'undefined') {
        localStorage.removeItem('casagrown_bulk_listing_draft')
      }

      // Launch Social Sharing modal for the booth before navigation
      setSuccessBoothId(targetBoothId)
      setShowSuccessShareModal(true)
      setIsSubmitting(false)
    } catch (err: any) {
      console.error('Publish error message:', err?.message, 'details:', err?.details, 'hint:', err?.hint, err)
      setGlobalError(err?.message || err?.details || 'An error occurred while publishing your listings. Please try again.')
      setIsSubmitting(false)
    }

  }


  // === NEW 2-STEP WIZARD UI ===
  const [wizardStep, setWizardStep] = useState<1 | 2>(1)
  const [selectedDeliveryWindows, setSelectedDeliveryWindows] = useState<string[]>(['weekday_evenings', 'weekend_mornings'])
  const [selectedPickupWindows, setSelectedPickupWindows] = useState<string[]>(['weekday_evenings', 'weekend_mornings'])
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  
  const editingRow = produceRows.find(r => r.id === editingRowId)
  const selectedRows = produceRows.filter(r => r.isSelected)
  const rawZipParam = searchParams.get('zipcode') || searchParams.get('zip')
  const cleanZipDisplay = (zipcode || rawZipParam || '').trim().replace(/[^0-9]/g, '')
  const isCartEmpty = selectedRows.length === 0

  // Set dark background on html/body while on this page, restore on unmount
  useEffect(() => {
    const htmlPrev = document.documentElement.style.backgroundColor
    const bodyPrev = document.body ? document.body.style.backgroundColor : ''
    document.documentElement.style.backgroundColor = '#0a0f09'
    if (document.body) document.body.style.backgroundColor = '#0a0f09'
    return () => {
      document.documentElement.style.backgroundColor = htmlPrev
      if (document.body) document.body.style.backgroundColor = bodyPrev
    }
  }, [])

  return (
    <div style={{ background: '#0a0f09', minHeight: '100vh', paddingBottom: 120, color: '#ffffff', fontFamily: 'Inter, sans-serif', position: 'relative' }}>
      {/* Background ambient lighting */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(34,197,94,0.14) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 80% 80%, rgba(245,166,35,0.08) 0%, transparent 60%)', zIndex: 0 }} />

      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} />
      {activeCameraRowId && <CameraCapture onCapture={handlePhotoCaptured} onClose={() => setActiveCameraRowId(null)} />}

      <main style={{ maxWidth: 620, margin: '0 auto', padding: '28px 18px', position: 'relative', zIndex: 1 }}>
        
        {wizardStep === 1 && (
          <div className="wizard-step-1">
            {/* Trust & Demand Header matching ad promise */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '5px 14px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12, border: '1px solid rgba(34,197,94,0.3)' }}>
                <span>✨</span> High Buyer Demand • 100% Free to List
              </div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#ffffff', marginBottom: 8, lineHeight: 1.25, letterSpacing: '-0.5px' }}>
                Items you would like to sell
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14.5, lineHeight: 1.5, marginBottom: 16 }}>
                Tap the items you want to list. We&apos;ve pre-set recommended local prices {buyerDemand.locationLabel ? `(${buyerDemand.locationLabel})` : ''} — adjust anything anytime.
              </p>


              {/* 3 Trust Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, background: 'rgba(255,255,255,0.04)', padding: '12px 10px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center', backdropFilter: 'blur(12px)', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80' }}>
                    {buyerDemand.totalBuyers > 0 
                      ? (buyerDemand.totalBuyers >= 10 ? `${buyerDemand.totalBuyers}+` : `${buyerDemand.totalBuyers}`) 
                      : '0'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Buyer Requests</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80' }}>$0</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Free to List</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80' }}>60s</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Instant Setup</div>
                </div>
              </div>

              {/* Quick Select All Header Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>
                  Tap crops below to add ({selectedRows.length} of {produceRows.length} selected):
                </span>
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: '#4ade80',
                    borderRadius: 20,
                    padding: '5px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>

              {produceRows.map(row => {
                const rowKeys = normalizeProduceKey(row.name)
                let demandCount = 0
                for (const k of rowKeys) {
                  if (buyerDemand.produceCounts[k]) {
                    demandCount = Math.max(demandCount, buyerDemand.produceCounts[k])
                  }
                }
                const isSelected = row.isSelected
                const displayPrice = row.priceUsd ? parseFloat(row.priceUsd).toFixed(2) : '3.50'
                const displayQty = row.quantity || '5'
                const unitPlural = row.unit === 'each' ? 'items' : (row.unit || 'unit') + 's'

                return (
                  <div 
                    key={row.id}
                    onClick={() => {
                      const nextSelected = !isSelected
                      handleUpdateRow(row.id, { isSelected: nextSelected })
                      trackEvent('button_click', PAGE_SLUG, { action: 'card_toggle_select', produce: row.name, is_selected: nextSelected })
                    }}
                    style={{
                      position: 'relative', borderRadius: 16,
                      border: isSelected ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.12)',
                      background: isSelected ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.04)', overflow: 'hidden', cursor: 'pointer',
                      transition: 'all 0.2s', opacity: 1,
                      boxShadow: isSelected ? '0 0 20px rgba(34,197,94,0.28)' : 'none',
                      backdropFilter: 'blur(8px)',
                      transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <div style={{ width: '100%', aspectRatio: '1', position: 'relative', background: 'rgba(255,255,255,0.06)' }}>
                      {(row.customPhotoDataUrl || row.stockImage) ? (
                        <img src={row.customPhotoDataUrl || row.stockImage} alt={row.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🌱</div>
                      )}
                      {isSelected ? (
                        <div style={{ position: 'absolute', top: 8, right: 8, background: '#22c55e', color: '#0a0f09', borderRadius: 20, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 900, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                          <span>✓</span> Added
                        </div>
                      ) : (
                        <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(10,15,9,0.8)', color: '#4ade80', borderRadius: 20, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, border: '1px solid rgba(74,222,128,0.5)' }}>
                          <span>+</span> Add
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '10px 10px 12px 10px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 14.5, fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                          <span style={{ fontSize: 13.5, color: '#4ade80', fontWeight: 800 }}>
                            ${displayPrice} / {row.unit}
                          </span>
                          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                            {displayQty} {unitPlural}
                          </span>
                        </div>
                      </div>

                      {/* Prominent Touch Target Button */}

                      {/* Full-Width Prominent Edit Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUpdateRow(row.id, { isSelected: true })
                          setEditingRowId(row.id)
                          trackEvent('button_click', PAGE_SLUG, { action: 'card_open_edit_modal', produce: row.name })
                        }}
                        style={{
                          width: '100%',
                          marginTop: 10,
                          padding: '7px 0',
                          background: isSelected ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.06)',
                          border: isSelected ? '1px solid rgba(74,222,128,0.5)' : '1px solid rgba(255,255,255,0.18)',
                          borderRadius: 10,
                          color: isSelected ? '#4ade80' : 'rgba(255,255,255,0.9)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          transition: 'all 0.2s'
                        }}
                      >
                        ✎ Edit Price / Qty
                      </button>
                    </div>
                  </div>

                )
              })}

              {/* Add Custom Item Card */}
              <div 
                onClick={() => {
                  const newId = `custom_row_${Date.now()}`
                  const newRow: ProduceRowItem = {
                    id: newId,
                    isSelected: true,
                    name: '',
                    category: 'produce',
                    description: '',
                    quantity: '5',
                    unit: 'each',
                    priceUsd: '3.50',
                    isFree: false,
                    stockImage: '',
                    customPhotoDataUrl: null,
                    catalogItemId: null,
                    harvestedAt: null
                  }
                  setProduceRows(prev => [...prev, newRow])
                  setEditingRowId(newId)
                  trackEvent('button_click', PAGE_SLUG, { action: 'add_row' })
                }}
                style={{
                  borderRadius: 16,
                  border: '2px dashed rgba(74,222,128,0.4)',
                  background: 'rgba(34,197,94,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  minHeight: 200,
                  padding: 16,
                  textAlign: 'center',
                  gap: 8,
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>+</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>Add Custom Item</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Tap to add any crop</div>
              </div>
            </div>

            {/* Bottom Floating Proceed Bar */}
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10,15,9,0.95)', padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px)) 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10, backdropFilter: 'blur(16px)' }}>
              {(() => {
                const totalEstEarnings = selectedRows.reduce((sum, r) => sum + (parseFloat(r.priceUsd || '3.50') * (parseInt(r.quantity, 10) || 5)), 0)
                
                return (
                  <button 
                    onClick={() => {
                      if (isCartEmpty) {
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                        trackEvent('button_click', PAGE_SLUG, { action: 'step_1_empty_prompt_clicked' })
                      } else {
                        trackEvent('button_click', PAGE_SLUG, { 
                          action: 'step_1_proceed', 
                          selected_count: selectedRows.length,
                          est_value: totalEstEarnings
                        })
                        setWizardStep(2)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }
                    }}
                    style={{
                      width: '100%', maxWidth: 600, padding: '14px 20px', borderRadius: 100,
                      background: isCartEmpty 
                        ? 'rgba(255,255,255,0.1)' 
                        : 'linear-gradient(135deg, #22c55e, #16a34a)',
                      color: isCartEmpty ? 'rgba(255,255,255,0.7)' : '#ffffff',
                      fontSize: 16, fontWeight: 800,
                      border: isCartEmpty ? '1px solid rgba(255,255,255,0.2)' : 'none',
                      cursor: 'pointer',
                      boxShadow: isCartEmpty ? 'none' : '0 6px 24px rgba(34,197,94,0.4)',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2
                    }}
                  >
                    <span>
                      {isCartEmpty
                        ? 'Tap Crops Above to Add (0 selected)'
                        : `Sell My ${selectedRows.length} ${selectedRows.length === 1 ? 'Item' : 'Items'} (~$${totalEstEarnings.toFixed(2)}) →`}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>
                      {isCartEmpty ? 'Tap any crop you grow or have extra of' : 'Next: Set Delivery & Pickup'}
                    </span>

                  </button>
                )
              })()}
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="wizard-step-2" style={{ paddingBottom: 120 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <button 
                onClick={() => setWizardStep(1)} 
                style={{ 
                  background: 'rgba(255,255,255,0.08)', 
                  border: '1px solid rgba(255,255,255,0.18)', 
                  color: '#4ade80', 
                  fontSize: 13, 
                  padding: '8px 16px', 
                  borderRadius: 100, 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 6, 
                  fontWeight: 700 
                }}
              >
                ← Back to items ({selectedRows.length})
              </button>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', marginBottom: 20 }}>How should buyers get this?</h2>

            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32, width: '100%', boxSizing: 'border-box' }}>

              {/* Delivery Option */}
              <div id="delivery-section" style={{ border: offersDelivery ? (fieldErrors.delivery_zip ? '1.5px solid #ef4444' : '1px solid #22c55e') : '1px solid rgba(255,255,255,0.1)', borderRadius: 16, background: offersDelivery ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)', overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
                <label style={{ display: 'flex', gap: 12, padding: 18, cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                  <input 
                    type="checkbox" 
                    checked={offersDelivery} 
                    onChange={(e) => {
                      hasUserEditedFulfillmentRef.current = true
                      setOffersDelivery(e.target.checked)
                      if (!e.target.checked) {
                        setFieldErrors(prev => { const n = { ...prev }; delete n.delivery_zip; delete n.fulfillment; return n })
                      } else {
                        setFieldErrors(prev => { const n = { ...prev }; delete n.fulfillment; return n })
                      }
                    }} 
                    style={{ width: 20, height: 20, accentColor: '#22c55e', marginTop: 2, flexShrink: 0 }} 
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#ffffff' }}>I can deliver to neighbors</div>
                  </div>
                </label>

                {offersDelivery && (
                  <div style={{ padding: '0 18px 18px 18px', borderTop: '1px solid rgba(34,197,94,0.2)', paddingTop: 14, width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Delivery ZIP Code(s)</label>
                        <button type="button" onClick={() => handleGeolocate('delivery')} style={{ background: 'none', border: 'none', color: '#4ade80', fontSize: 13, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                          {geolocatingDelivery ? '📍 Locating...' : '📍 Use current location'}
                        </button>
                      </div>
                      <input 
                        type="text" 
                        placeholder="e.g. 95120 or 95120, 95123" 
                        value={zipInput} 
                        onChange={e => {
                          const val = e.target.value;
                          setZipInput(val);
                          const zips = val.match(/\b\d{5}\b/g);
                          if (zips && zips.length > 0) {
                            setDeliveryZipcodes(Array.from(new Set(zips)));
                            setZipcode(zips[0]);
                          }
                          setFieldErrors(prev => { const n = { ...prev }; delete n.delivery_zip; return n })
                        }} 
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          border: fieldErrors.delivery_zip ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 10,
                          fontSize: 15,
                          boxSizing: 'border-box',
                          background: 'rgba(255,255,255,0.08)',
                          color: '#fff'
                        }} 
                      />
                      {fieldErrors.delivery_zip && (
                        <div style={{ marginTop: 6, color: '#f87171', fontSize: 13, fontWeight: 600 }}>
                          {fieldErrors.delivery_zip}
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>Delivery Schedule</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: deliveryPreset === 'custom' ? 12 : 0 }}>
                        <button 
                          type="button" 
                          onClick={() => {
                            setDeliveryPreset('weekday_evenings')
                            setSelectedDeliveryWindows(['weekday_evenings'])
                            setCustomDeliveryWindows(getWindowsForPreset('weekday_evenings'))
                          }} 
                          style={{
                            padding: '8px 14px',
                            background: deliveryPreset === 'weekday_evenings' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                            borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: deliveryPreset === 'weekday_evenings' ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
                            color: deliveryPreset === 'weekday_evenings' ? '#4ade80' : 'rgba(255,255,255,0.8)'
                          }}>
                          🌆 Weekday evenings
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setDeliveryPreset('weekend_mornings')
                            setSelectedDeliveryWindows(['weekend_mornings'])
                            setCustomDeliveryWindows(getWindowsForPreset('weekend_mornings'))
                          }} 
                          style={{
                            padding: '8px 14px',
                            background: deliveryPreset === 'weekend_mornings' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                            borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: deliveryPreset === 'weekend_mornings' ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
                            color: deliveryPreset === 'weekend_mornings' ? '#4ade80' : 'rgba(255,255,255,0.8)'
                          }}>
                          🌅 Weekend mornings
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setDeliveryPreset('both')
                            setSelectedDeliveryWindows(['weekday_evenings', 'weekend_mornings'])
                            setCustomDeliveryWindows(getWindowsForPreset('both'))
                          }} 
                          style={{
                            padding: '8px 14px',
                            background: deliveryPreset === 'both' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                            borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: deliveryPreset === 'both' ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
                            color: deliveryPreset === 'both' ? '#4ade80' : 'rgba(255,255,255,0.8)'
                          }}>
                          ☀️ Both (Recommended)
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setDeliveryPreset('custom')} 
                          style={{
                            padding: '8px 14px',
                            background: deliveryPreset === 'custom' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                            borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: deliveryPreset === 'custom' ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
                            color: deliveryPreset === 'custom' ? '#4ade80' : 'rgba(255,255,255,0.8)'
                          }}>
                          📅 Custom schedule
                        </button>
                      </div>

                      {deliveryPreset === 'custom' && (
                        <div style={{ background: '#111812', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, marginTop: 10, overflowX: 'auto' }}>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textAlign: 'center' }}>Tap any hour cell to set custom delivery hours</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center' }}>
                            <thead>
                              <tr>
                                <th style={{ width: 32, padding: '4px 2px' }}></th>
                                {dayOptions.map(d => (
                                  <th key={d.date} style={{ padding: '4px 2px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                                    {d.label.split(' ')[0]}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: 13 }).map((_, index) => {
                                const hour = 8 + index
                                const isPm = hour >= 12
                                const hourNum = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                                const hourLabel = `${hourNum}${isPm ? 'p' : 'a'}`
                                return (
                                  <tr key={hour}>
                                    <td style={{ color: 'rgba(255,255,255,0.5)', padding: '3px 0', fontSize: 10 }}>{hourLabel}</td>
                                    {dayOptions.map(opt => {
                                      const isSelected = isHourSelected(hour, customDeliveryWindows[opt.date] || [])
                                      return (
                                        <td
                                          key={opt.date}
                                          onClick={() => toggleHourCell(opt.date, hour, customDeliveryWindows, setCustomDeliveryWindows)}
                                          style={{
                                            height: 22,
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            background: isSelected ? '#22c55e' : 'rgba(255,255,255,0.04)',
                                            cursor: 'pointer',
                                            borderRadius: 2
                                          }}
                                        />
                                      )
                                    })}
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Pickup Option */}
              <div id="pickup-section" style={{ border: offersPickup ? (fieldErrors.pickup_addr ? '1.5px solid #ef4444' : '1px solid #22c55e') : '1px solid rgba(255,255,255,0.1)', borderRadius: 16, background: offersPickup ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)', overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
                <label style={{ display: 'flex', gap: 12, padding: 18, cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                  <input 
                    type="checkbox" 
                    checked={offersPickup} 
                    onChange={(e) => {
                      hasUserEditedFulfillmentRef.current = true
                      setOffersPickup(e.target.checked)
                      if (!e.target.checked) {
                        setFieldErrors(prev => { const n = { ...prev }; delete n.pickup_addr; delete n.fulfillment; return n })
                      } else {
                        setFieldErrors(prev => { const n = { ...prev }; delete n.fulfillment; return n })
                      }
                    }} 
                    style={{ width: 20, height: 20, accentColor: '#22c55e', marginTop: 2, flexShrink: 0 }} 
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#ffffff' }}>Buyers can pick up from me</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Buyers pick up directly from your porch or doorstep</div>
                  </div>
                </label>

                {offersPickup && (
                  <div style={{ padding: '0 18px 18px 18px', borderTop: '1px solid rgba(34,197,94,0.2)', paddingTop: 14, width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Pickup Address / Neighborhood</label>
                        <button type="button" onClick={() => handleGeolocate('pickup')} style={{ background: 'none', border: 'none', color: '#4ade80', fontSize: 13, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                          {geolocatingPickup ? '📍 Locating...' : '📍 Use current location'}
                        </button>
                      </div>
                      <input 
                        type="text" 
                        placeholder="123 Apple Tree Ln" 
                        value={pickupAddr.street} 
                        onChange={e => {
                          setPickupAddr({...pickupAddr, street: e.target.value})
                          setFieldErrors(prev => { const n = { ...prev }; delete n.pickup_addr; return n })
                        }} 
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          border: fieldErrors.pickup_addr && !pickupAddr.street.trim() ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 10,
                          fontSize: 15,
                          marginBottom: 8,
                          boxSizing: 'border-box',
                          background: 'rgba(255,255,255,0.08)',
                          color: '#fff'
                        }} 
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, width: '100%', boxSizing: 'border-box' }}>
                        <input 
                          type="text" 
                          placeholder="City" 
                          value={pickupAddr.city} 
                          onChange={e => {
                            setPickupAddr({...pickupAddr, city: e.target.value})
                            setFieldErrors(prev => { const n = { ...prev }; delete n.pickup_addr; return n })
                          }} 
                          style={{
                            width: '100%',
                            minWidth: 0,
                            padding: '12px 14px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 10,
                            fontSize: 15,
                            boxSizing: 'border-box',
                            background: 'rgba(255,255,255,0.08)',
                            color: '#fff'
                          }} 
                        />
                        <input 
                          type="text" 
                          placeholder="ZIP" 
                          value={pickupAddr.zip} 
                          onChange={e => {
                            setPickupAddr({...pickupAddr, zip: e.target.value})
                            setFieldErrors(prev => { const n = { ...prev }; delete n.pickup_addr; return n })
                          }} 
                          style={{
                            width: '100%',
                            minWidth: 0,
                            padding: '12px 14px',
                            border: fieldErrors.pickup_addr && !pickupAddr.zip.trim() ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 10,
                            fontSize: 15,
                            boxSizing: 'border-box',
                            background: 'rgba(255,255,255,0.08)',
                            color: '#fff'
                          }} 
                        />
                      </div>
                      {fieldErrors.pickup_addr && (
                        <div style={{ marginTop: 8, color: '#f87171', fontSize: 13, fontWeight: 600 }}>
                          {fieldErrors.pickup_addr}
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>Pickup Schedule</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: pickupPreset === 'custom' ? 12 : 0 }}>
                        <button 
                          type="button" 
                          onClick={() => {
                            setPickupPreset('weekday_evenings')
                            setSelectedPickupWindows(['weekday_evenings'])
                            setCustomPickupWindows(getWindowsForPreset('weekday_evenings'))
                          }} 
                          style={{
                            padding: '8px 14px',
                            borderRadius: 100,
                            border: pickupPreset === 'weekday_evenings' ? '1.5px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
                            background: pickupPreset === 'weekday_evenings' ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.05)',
                            color: pickupPreset === 'weekday_evenings' ? '#4ade80' : '#ffffff',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer'
                          }}
                        >
                          🌆 Weekday evenings
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setPickupPreset('weekend_mornings')
                            setSelectedPickupWindows(['weekend_mornings'])
                            setCustomPickupWindows(getWindowsForPreset('weekend_mornings'))
                          }} 
                          style={{
                            padding: '8px 14px',
                            borderRadius: 100,
                            border: pickupPreset === 'weekend_mornings' ? '1.5px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
                            background: pickupPreset === 'weekend_mornings' ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.05)',
                            color: pickupPreset === 'weekend_mornings' ? '#4ade80' : '#ffffff',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer'
                          }}
                        >
                          🌅 Weekend mornings
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setPickupPreset('both')
                            setSelectedPickupWindows(['weekday_evenings', 'weekend_mornings'])
                            setCustomPickupWindows(getWindowsForPreset('both'))
                          }} 
                          style={{
                            padding: '8px 14px',
                            borderRadius: 100,
                            border: pickupPreset === 'both' ? '1.5px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
                            background: pickupPreset === 'both' ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.05)',
                            color: pickupPreset === 'both' ? '#4ade80' : '#ffffff',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer'
                          }}
                        >
                          🌟 Both (Recommended)
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setPickupPreset('custom')} 
                          style={{
                            padding: '8px 14px',
                            borderRadius: 100,
                            border: pickupPreset === 'custom' ? '1.5px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
                            background: pickupPreset === 'custom' ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.05)',
                            color: pickupPreset === 'custom' ? '#4ade80' : '#ffffff',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer'
                          }}
                        >
                          📅 Custom schedule
                        </button>
                      </div>

                      {pickupPreset === 'custom' && (
                        <div style={{ background: '#111812', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, marginTop: 10, overflowX: 'auto' }}>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textAlign: 'center' }}>Tap any hour cell to set custom pickup hours</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center' }}>
                            <thead>
                              <tr>
                                <th style={{ width: 32, padding: '4px 2px' }}></th>
                                {dayOptions.map(d => (
                                  <th key={d.date} style={{ padding: '4px 2px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                                    {d.label.split(' ')[0]}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: 13 }).map((_, index) => {
                                const hour = 8 + index
                                const isPm = hour >= 12
                                const hourNum = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                                const hourLabel = `${hourNum}${isPm ? 'p' : 'a'}`
                                return (
                                  <tr key={hour}>
                                    <td style={{ color: 'rgba(255,255,255,0.5)', padding: '3px 0', fontSize: 10 }}>{hourLabel}</td>
                                    {dayOptions.map(opt => {
                                      const isSelected = isHourSelected(hour, customPickupWindows[opt.date] || [])
                                      return (
                                        <td
                                          key={opt.date}
                                          onClick={() => toggleHourCell(opt.date, hour, customPickupWindows, setCustomPickupWindows)}
                                          style={{
                                            height: 22,
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            background: isSelected ? '#22c55e' : 'rgba(255,255,255,0.04)',
                                            cursor: 'pointer',
                                            borderRadius: 2
                                          }}
                                        />
                                      )
                                    })}
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', marginBottom: 16 }}>Publish Your Listings</h2>
            <div style={{ padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, backdropFilter: 'blur(12px)' }}>
              <div style={{ padding: 12, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, fontSize: 13, color: '#4ade80', marginBottom: 16 }}>
                <strong>No Listing Fees:</strong> CasaGrown is 100% free to list. A small {platformFeePct}% platform fee only applies when you make a sale.
              </div>

              <div id="tos-container" style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 12,
                background: fieldErrors.tos ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                border: fieldErrors.tos ? '1.5px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s'
              }}>
                {fieldErrors.tos && (
                  <div style={{ marginBottom: 8, color: '#f87171', fontSize: 13, fontWeight: 600 }}>
                    {fieldErrors.tos}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
                  <input 
                    type="checkbox" 
                    id="tos-checkbox"
                    checked={agreedTos} 
                    onChange={e => {
                      setAgreedTos(e.target.checked)
                      if (e.target.checked) {
                        setFieldErrors(prev => { const n = { ...prev }; delete n.tos; return n })
                      }
                    }} 
                    style={{ width: 18, height: 18, accentColor: '#22c55e', marginTop: 2, cursor: 'pointer' }} 
                  />
                  <span>
                    I agree to the <button type="button" onClick={(e) => {e.preventDefault(); setLegalModalContent('tos')}} style={{background:'none',border:'none',color:'#4ade80',textDecoration:'underline',cursor:'pointer',padding:0,fontWeight:600}}>Terms of Service</button> and <button type="button" onClick={(e) => {e.preventDefault(); setLegalModalContent('privacy')}} style={{background:'none',border:'none',color:'#4ade80',textDecoration:'underline',cursor:'pointer',padding:0,fontWeight:600}}>Privacy Policy</button>
                  </span>
                </div>
              </div>

              {/* Login/Signup UI if guest, else Submit Button */}
              {(!user) ? (
                <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4, color: '#ffffff' }}>Publish & Notify Local Buyers</h3>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 14 }}>Create your free seller account or sign in with 1 tap:</p>


                  {authError && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: 10, color: '#fca5a5', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                      <span>⚠️</span> {authError}
                    </div>
                  )}

                  <button 
                    type="button"
                    onClick={() => handleOAuthLogin('google')} 
                    style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: 8, 
                      background: '#ffffff', 
                      border: 'none', 
                      borderRadius: 10, 
                      padding: '12px 14px', 
                      fontSize: '0.95rem', 
                      fontWeight: 700, 
                      color: '#0f172a', 
                      cursor: 'pointer', 
                      marginBottom: 10,
                      boxSizing: 'border-box'
                    }}>
                    <span style={{ fontSize: '15px' }}>🌐</span> Continue with Google
                  </button>

                  <button 
                    type="button"
                    onClick={() => handleOAuthLogin('apple')} 
                    style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: 8, 
                      background: '#ffffff', 
                      border: 'none', 
                      borderRadius: 10, 
                      padding: '12px 14px', 
                      fontSize: '0.95rem', 
                      fontWeight: 700, 
                      color: '#0f172a', 
                      cursor: 'pointer', 
                      marginBottom: 16,
                      boxSizing: 'border-box'
                    }}>
                    <span style={{ fontSize: '15px' }}></span> Continue with Apple
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '22px 0 16px 0', color: 'rgba(255,255,255,0.85)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.2)' }} />
                    <span>Or receive a 6-digit code via email</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.2)' }} />
                  </div>

                  {/* Name Input (for Email flow) */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'rgba(255,255,255,0.85)' }}>Your Name</label>
                    <input 
                      id="auth-name-input"
                      type="text" 
                      placeholder="e.g. Sarah Jenkins" 
                      value={authName} 
                      onChange={(e) => {
                        setAuthName(e.target.value)
                        setFieldErrors(prev => { const n = { ...prev }; delete n.stand_name; return n })
                      }} 
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: fieldErrors.stand_name ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 10,
                        fontSize: 15,
                        boxSizing: 'border-box',
                        background: 'rgba(255,255,255,0.08)',
                        color: '#fff'
                      }} 
                    />
                    {fieldErrors.stand_name && (
                      <div style={{ marginTop: 6, color: '#f87171', fontSize: 13, fontWeight: 600 }}>
                        {fieldErrors.stand_name}
                      </div>
                    )}
                  </div>

                  {/* Email Input + Get Code Button */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'rgba(255,255,255,0.85)' }}>Your Email</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input 
                        id="auth-email-input"
                        type="email" 
                        placeholder="e.g. sarah@example.com" 
                        value={authEmail} 
                        onChange={e => {
                          setAuthEmail(e.target.value)
                          setFieldErrors(prev => { const n = { ...prev }; delete n.email; return n })
                        }} 
                        style={{
                          flex: 1,
                          padding: '13px 16px',
                          border: fieldErrors.email ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.25)',
                          borderRadius: 12,
                          boxSizing: 'border-box',
                          minWidth: 0,
                          background: 'rgba(255,255,255,0.08)',
                          color: '#fff',
                          fontSize: '15px'
                        }} 
                      />
                      <button 
                        type="button"
                        onClick={handleSendOtp} 
                        disabled={isSendingOtp} 
                        style={{
                          padding: '0 22px',
                          background: '#22c55e',
                          color: '#0a0f09',
                          border: 'none',
                          borderRadius: 12,
                          fontWeight: 800,
                          fontSize: '15px',
                          cursor: isSendingOtp ? 'not-allowed' : 'pointer',
                          opacity: isSendingOtp ? 0.7 : 1,
                          boxShadow: '0 2px 10px rgba(34,197,94,0.3)'
                        }}
                      >
                        {isSendingOtp ? 'Sending...' : 'Get Code'}
                      </button>
                    </div>
                    {fieldErrors.email && (
                      <div style={{ marginTop: 6, color: '#f87171', fontSize: 13, fontWeight: 600 }}>
                        {fieldErrors.email}
                      </div>
                    )}
                  </div>
                  {(modalStep === 'otp') && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      <input 
                        type="text" 
                        placeholder="Enter 6-digit code" 
                        value={authOtp} 
                        onChange={e => {
                          setAuthOtp(e.target.value)
                          setAuthError('')
                        }} 
                        style={{
                          flex: 1,
                          padding: '13px 16px',
                          border: authError ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.25)',
                          borderRadius: 12,
                          boxSizing: 'border-box',
                          minWidth: 0,
                          background: 'rgba(255,255,255,0.08)',
                          color: '#fff',
                          fontSize: '15px'
                        }} 
                      />
                      <button 
                        type="button"
                        onClick={handleVerifyOtp} 
                        disabled={isVerifyingOtp} 
                        style={{
                          padding: '0 22px',
                          background: '#22c55e',
                          color: '#0a0f09',
                          border: 'none',
                          borderRadius: 12,
                          fontWeight: 800,
                          fontSize: '15px',
                          cursor: isVerifyingOtp ? 'not-allowed' : 'pointer',
                          opacity: isVerifyingOtp ? 0.7 : 1,
                          boxShadow: '0 2px 10px rgba(34,197,94,0.3)'
                        }}
                      >
                        {isVerifyingOtp ? 'Verifying...' : 'Verify & Publish'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 13, color: 'rgba(255,255,255,0.8)', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)' }}>
                    <span>Signed in as <strong>{user?.email || authName || 'Seller'}</strong></span>
                    <button 
                      type="button" 
                      onClick={async () => {
                        await supabase.auth.signOut()
                        if (refreshAuth) await refreshAuth()
                        window.location.reload()
                      }} 
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 13, fontWeight: 600 }}
                    >
                      Sign out
                    </button>
                  </div>
                  <button 
                    type="button"
                    onClick={handleFinalPublishSubmit}
                    disabled={isSubmitting || !agreedTos || (!offersDelivery && !offersPickup)}
                    style={{ width: '100%', padding: '16px', borderRadius: 100, background: isSubmitting || !agreedTos || (!offersDelivery && !offersPickup) ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: isSubmitting || !agreedTos || (!offersDelivery && !offersPickup) ? 'rgba(255,255,255,0.3)' : '#ffffff', fontSize: 16, fontWeight: 700, border: 'none', cursor: isSubmitting || !agreedTos || (!offersDelivery && !offersPickup) ? 'not-allowed' : 'pointer', boxShadow: '0 6px 20px rgba(34,197,94,0.35)' }}
                  >
                    {isSubmitting ? 'Publishing & Notifying Buyers...' : `🚀 Publish & Notify Buyers (${selectedRows.length} ${selectedRows.length === 1 ? 'Listing' : 'Listings'})`}
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Return to Step 1 Button */}
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setWizardStep(1)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '8px 16px',
                  textDecoration: 'underline'
                }}
              >
                ← Back to edit crops ({selectedRows.length} selected)
              </button>
            </div>
          </div>
        )}


      </main>

      {/* Edit Item Modal / Bottom Sheet */}
      {editingRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#111812', width: '100%', maxWidth: 600, borderTopLeftRadius: 24, borderTopRightRadius: 24, border: '1px solid rgba(255,255,255,0.15)', borderBottom: 'none', padding: '24px 24px calc(48px + env(safe-area-inset-bottom, 0px)) 24px', maxHeight: '88dvh', overflowY: 'auto', overscrollBehavior: 'contain', color: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#ffffff' }}>{editingRow.name || 'Add New Item'}</h3>
              <button onClick={() => setEditingRowId(null)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>

            {(!editingRow.stockImage || !editingRow.name) && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>Item Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Meyer Lemons, Fresh Honey, Sourdough..." 
                  value={editingRow.name} 
                  onChange={(e) => {
                    const val = e.target.value
                    handleUpdateRow(editingRow.id, { 
                      name: val,
                      description: val ? `Fresh homegrown ${val}` : editingRow.description
                    })
                  }} 
                  style={{ width: '100%', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, fontSize: '15px', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', color: '#fff' }} 
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 100, height: 100, borderRadius: 12, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.15)' }}>
                  {(editingRow.customPhotoDataUrl || editingRow.stockImage) ? (
                    <img src={editingRow.customPhotoDataUrl || editingRow.stockImage} alt="Item" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🌱</div>
                  )}
                </div>
                <button 
                  onClick={() => setActiveCameraRowId(editingRow.id)} 
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 100, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span style={{ fontSize: 14 }}>📷</span> Change Photo
                </button>
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>Price ($)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="number" step="0.25" value={editingRow.priceUsd} onChange={(e) => handleUpdateRow(editingRow.id, { priceUsd: e.target.value })} style={{ flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, fontSize: '16px', color: '#fff', background: 'rgba(255,255,255,0.08)' }} />
                    <span style={{ alignSelf: 'center', color: 'rgba(255,255,255,0.6)' }}>per</span>
                    <select value={editingRow.unit} onChange={(e) => handleUpdateRow(editingRow.id, { unit: e.target.value })} style={{ flex: 1, minWidth: 0, padding: '10px 8px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, fontSize: '15px', background: '#1e2920', color: '#fff', appearance: 'auto', textOverflow: 'ellipsis' }}>
                      <option value="lb">lb</option>
                      <option value="each">each</option>
                      <option value="bunch">bunch</option>
                      <option value="dozen">dozen</option>
                      <option value="oz">oz</option>
                      <option value="bag">bag</option>
                      <option value="basket">basket</option>
                      <option value="box">box</option>
                      <option value="pint">pint</option>
                      <option value="quart">quart</option>
                      <option value="jar">jar</option>
                      <option value="loaf">loaf</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>Total available to sell</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="number" value={editingRow.quantity} onChange={(e) => handleUpdateRow(editingRow.id, { quantity: e.target.value })} style={{ flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, fontSize: '16px', color: '#fff', background: 'rgba(255,255,255,0.08)', boxSizing: 'border-box' }} />
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, minWidth: '50px' }}>
                      {editingRow.unit === 'each' ? 'items' : 
                       editingRow.unit === 'box' ? 'boxes' : 
                       editingRow.unit === 'bunch' ? 'bunches' : 
                       editingRow.unit === 'loaf' ? 'loaves' : 
                       editingRow.unit === 'oz' ? 'oz' : 
                       (editingRow.unit || 'unit') + 's'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>
                🌾 Harvest Date <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input 
                type="date" 
                value={editingRow.harvestedAt || ''} 
                onChange={(e) => handleUpdateRow(editingRow.id, { harvestedAt: e.target.value || null })} 
                max={new Date().toISOString().split('T')[0]} 
                style={{ width: '100%', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, fontSize: '15px', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', color: '#fff' }} 
              />
              {editingRow.harvestedAt && (
                <div style={{ fontSize: 12, color: '#4ade80', marginTop: 6, fontWeight: 600 }}>
                  {(() => {
                    const days = Math.round((Date.now() - new Date(editingRow.harvestedAt + 'T12:00:00').getTime()) / 86400000)
                    if (days <= 0) return '🟢 Harvested today — ultra fresh!'
                    if (days === 1) return '🟢 Harvested yesterday — very fresh!'
                    if (days <= 3) return `🟢 Harvested ${days} days ago — fresh!`
                    return `🟡 Harvested ${days} days ago`
                  })()}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>Brief description (optional)</label>
              <textarea value={editingRow.description} onChange={(e) => handleUpdateRow(editingRow.id, { description: e.target.value })} placeholder="e.g., Picked fresh this morning! Very sweet." rows={2} style={{ width: '100%', padding: 12, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', color: '#fff' }} />
            </div>

            {rowErrors[editingRow.id] && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                ⚠️ {rowErrors[editingRow.id]}
              </div>
            )}

            <button 
              type="button"
              disabled={!!rowErrors[editingRow.id]}
              onClick={() => {
                const currentQty = (!editingRow.quantity || parseInt(editingRow.quantity, 10) <= 0) ? '5' : editingRow.quantity
                const currentPrice = (!editingRow.priceUsd || (parseFloat(editingRow.priceUsd) <= 0 && !editingRow.isFree)) ? '3.50' : editingRow.priceUsd
                handleUpdateRow(editingRow.id, { isSelected: true, quantity: currentQty, priceUsd: currentPrice })
                trackEvent('button_click', PAGE_SLUG, { action: 'save_crop_details', produce: editingRow.name, price: currentPrice, qty: currentQty })
                setEditingRowId(null)
              }} 
              style={{ width: '100%', padding: '16px', background: rowErrors[editingRow.id] ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: rowErrors[editingRow.id] ? 'rgba(255,255,255,0.3)' : '#fff', fontSize: 16, fontWeight: 700, border: 'none', borderRadius: 100, cursor: rowErrors[editingRow.id] ? 'not-allowed' : 'pointer', boxShadow: '0 6px 20px rgba(34,197,94,0.35)' }}
            >
              Save Details
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button 
                type="button" 
                onClick={() => { 
                  handleUpdateRow(editingRow.id, { isSelected: false })
                  trackEvent('button_click', PAGE_SLUG, { action: 'remove_crop_from_modal', produce: editingRow.name })
                  setEditingRowId(null) 
                }} 
                style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
              >
                Remove Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Terms of Service / Privacy Policy In-Modal Overlay */}
      {legalModalContent && (
        <>
          <div onClick={() => setLegalModalContent(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10000, background: '#111812', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, width: '90%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#ffffff' }}>{legalModalContent === 'tos' ? '📜 Terms of Service' : '🔒 Privacy Policy'}</h3>
              <button type="button" onClick={() => setLegalModalContent(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>✕</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {(legalModalContent === 'tos' ? TERMS_SECTIONS : PRIVACY_SECTIONS).map((section, si) => (
                <div key={si} style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: '0.95rem', color: '#4ade80', marginBottom: 8, fontWeight: 700 }}>{section.title}</h4>
                  {section.paragraphs.map((p, pi) => <p key={pi} style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.55, marginBottom: 8 }}>{p}</p>)}
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setLegalModalContent(null)} style={{ background: '#22c55e', color: '#0a0f09', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </>
      )}

      {showSuccessShareModal && successBoothId && (
        <SocialShareModal
          isOpen={showSuccessShareModal}
          onClose={() => {
            setShowSuccessShareModal(false)
            if (typeof window !== 'undefined') {
              window.location.href = `/my-stands/${successBoothId}`
            }
          }}
          title="Share Your Stand with Neighbors"
          subtitle="Let your local neighborhood know your stand is live and open for orders!"
          entityName="My Produce Stand"
          shareUrl={typeof window !== 'undefined' ? `${window.location.origin}/market/booth/${successBoothId}` : `/market/booth/${successBoothId}`}
          shareMessage="🌿 Fresh produce is available at my backyard stand! Browse & order on CasaGrown Market:"
          theme="dark"
        />

      )}
    </div>
  )
}

