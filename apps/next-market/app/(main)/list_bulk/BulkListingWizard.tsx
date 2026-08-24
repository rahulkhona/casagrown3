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
  const [offersPickup, setOffersPickup] = useState(true)
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
        setDeliveryZipcodes(prev => (prev.includes(cleanZip) ? prev : [...prev, cleanZip]))
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
          quantity: '5',
          priceUsd: '',
        }
      })
      setProduceRows(rows)
      rows.forEach((r, idx) => {
        trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_name_auto`, true)
        trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_qty`, true)
        trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_selected`, true)
      })
    } else {
      // Sensible seasonal defaults when no URL params provided
      const defaultCrops = ['tomatoes', 'cucumbers', 'lemons', 'strawberries', 'basil', 'bell_peppers', 'chicken_eggs', 'raw_honey']
      const rows = defaultCrops.map((name, i) => {
        const r = createRowFromProduceName(name, `default_row_${i}`)
        return {
          ...r,
          isSelected: false,
          quantity: '5',
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
                  unit: benchmarkData.unit || r.unit
                } : r))
              )
              return
            }

            // 2. Fallback: Query recent community marketplace products matching the name
            const { data: matches } = await supabase
              .from('market_products')
              .select('price_usd, seller_id')
              .ilike('name', `%${row.name}%`)
              .limit(50)

            if (matches && matches.length > 0) {
              let pricesToAverage = matches

              // If we have a local zip, try to filter by local booths first
              if (zipcode) {
                const sellerIds = Array.from(new Set(matches.map((m: any) => m.seller_id)))
                const { data: booths } = await supabase
                  .from('market_booths')
                  .select('owner_id, booth_zip, delivery_zipcodes')
                  .in('owner_id', sellerIds)

                if (booths && booths.length > 0) {
                  const localMatches = matches.filter((m: any) => {
                    const b = booths.find((booth: any) => booth.owner_id === m.seller_id)
                    if (!b) return false
                    return b.booth_zip === zipcode || (b.delivery_zipcodes && b.delivery_zipcodes.includes(zipcode))
                  })

                  if (localMatches.length > 0) {
                    pricesToAverage = localMatches
                  }
                }
              }

              // Calculate average
              const sum = pricesToAverage.reduce((acc: number, curr: any) => acc + Number(curr.price_usd), 0)
              const avg = sum / pricesToAverage.length
              if (avg > 0) {
                const finalPrice = avg.toFixed(2)
                setProduceRows(prev =>
                  prev.map(r => (r.id === row.id ? { ...r, priceUsd: finalPrice } : r))
                )
              }
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
              setAuthName(booth.name)
            }
            
            // Prefill fulfillment toggles
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
            return
          }
        } catch (err) {
          console.warn('Error loading booth:', err)
        }
      }

      // Guest / New User: fetch IP location from Vercel edge header endpoint
      if (!zipcode) {
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

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    saveDraftToStorage()
    trackEvent('button_click', PAGE_SLUG, { action: `social_login_${provider}` })

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com'
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${origin}/api/auth/callback?redirect=${encodeURIComponent('/list_bulk?autostart=1')}`,
      },
    })
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')

    if (!authName.trim()) {
      setAuthError('Please enter your full name')
      return
    }
    if (!authEmail.trim()) {
      setAuthError('Please enter your email address')
      return
    }

    setIsSendingOtp(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          data: {
            full_name: authName.trim(),
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

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')

    if (!authOtp.trim() || authOtp.trim().length < 6) {
      setAuthError('Please enter the 6-digit code sent to your email')
      return
    }

    setIsVerifyingOtp(true)
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: authEmail.trim().toLowerCase(),
        token: authOtp.trim(),
        type: 'email',
      })

      if (error) throw error
      if (data.user) {
        setVerifiedUserId(data.user.id)
        setAgreedTos(true)
        trackEvent('wizard_step', PAGE_SLUG, { step_index: 3, step_name: 'review_and_tos' })
        await executePublish(data.user.id)
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Invalid or expired code. Please try again.')
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
        await executePublish(user.id)
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
    e.preventDefault()
    setAuthError('')

    if (!agreedTos) {
      setAuthError('Please agree to the Terms of Service and Privacy Policy to publish.')
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

      // Execute publish
      await executePublish(targetUserId)
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to complete setup. Please try again.')
      setIsSubmitting(false)
    }
  }

  const executePublish = async (userId: string) => {
    setIsSubmitting(true)
    setGlobalError('')

    try {
      // 1. Resolve or Create Stand / Booth
      let targetBoothId = existingBoothId
      const finalZip =
        zipcode.trim() ||
        deliveryBaseAddr.zip.trim() ||
        pickupAddr.zip.trim() ||
        '94024'

      const deliveryWindows = deliveryPreset === 'custom' 
        ? customDeliveryWindows 
        : getWindowsForPreset(deliveryPreset)

      const pickupWindows = pickupPreset === 'custom' 
        ? customPickupWindows 
        : getWindowsForPreset(pickupPreset)

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
      const inputZips = zipInput.match(/\b\d{5}\b/g) || []
      const resolvedDeliveryZipcodes = inputZips.length > 0 ? Array.from(new Set(inputZips)) : deliveryZipcodes
      const pickupStr = offersPickup && isAddressComplete(pickupAddr) ? formatFullAddress(pickupAddr) : null

      if (!targetBoothId) {
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('create_stand', {
            p_name: standName,
            p_pickup_address: pickupStr,
            p_offers_delivery: offersDelivery,
            p_offers_pickup: offersPickup,
            p_delivery_radius_miles: offersDelivery ? deliveryRadius : null,
            p_delivery_zipcodes: offersDelivery && resolvedDeliveryZipcodes.length > 0 ? resolvedDeliveryZipcodes : (finalZip ? [finalZip] : []),
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
              offers_delivery: offersDelivery,
              offers_pickup: offersPickup,
              delivery_radius_miles: offersDelivery ? deliveryRadius : null,
              delivery_zipcodes: offersDelivery && resolvedDeliveryZipcodes.length > 0 ? resolvedDeliveryZipcodes : (finalZip ? [finalZip] : []),
              pickup_address: pickupStr,
              weekly_delivery_windows: offersDelivery ? deliveryWindows : null,
              weekly_pickup_windows: offersPickup ? pickupWindows : null,
              status: 'active',
              is_active: true,
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
      await supabase
        .from('market_booths')
        .update({
          offers_delivery: offersDelivery,
          offers_pickup: offersPickup,
          delivery_radius_miles: offersDelivery ? deliveryRadius : null,
          delivery_zipcodes: offersDelivery && resolvedDeliveryZipcodes.length > 0 ? resolvedDeliveryZipcodes : (finalZip ? [finalZip] : []),
          pickup_address: pickupStr,
          weekly_delivery_windows: offersDelivery ? deliveryWindows : null,
          weekly_pickup_windows: offersPickup ? pickupWindows : null,
          status: 'active',
          is_active: true,
        })
        .eq('id', targetBoothId)

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

      const formattedDeliveryWindows = offersDelivery ? formatProductWindows(deliveryWindows) : null
      const formattedPickupWindows = offersPickup ? formatProductWindows(pickupWindows) : null
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
          delivery_radius_miles: offersDelivery ? deliveryRadius : null,
          pickup_address: pickupStr,
          delivery_zipcodes: offersDelivery ? (deliveryZipcodes.length > 0 ? deliveryZipcodes : (finalZip ? [finalZip] : [])) : null,
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
        const boothAddrStr = formatFullAddress(deliveryBaseAddr)
        const fallbackAddr = boothAddrStr || finalZip
        const pickupStr = formatFullAddress(pickupAddr)

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
  const isCartEmpty = selectedRows.length === 0

  return (
    <div className={styles.container} style={{ background: '#fcfaf8', minHeight: '100vh', paddingBottom: 100 }}>
      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} />
      {activeCameraRowId && <CameraCapture onCapture={handlePhotoCaptured} onClose={() => setActiveCameraRowId(null)} />}

      <main style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
        
        {wizardStep === 1 && (
          <div className="wizard-step-1">
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Items you would like to sell</h1>
            <p style={{ color: '#4b5563', fontSize: 15, marginBottom: 24 }}>Tap an item to set its price and add details.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16 }}>
              {produceRows.map(row => {
                const isSelected = row.isSelected
                return (
                  <div 
                    key={row.id}
                    onClick={() => {
                      if (!isSelected) {
                        handleUpdateRow(row.id, { isSelected: true })
                        setTimeout(() => setEditingRowId(row.id), 50)
                      } else {
                        setEditingRowId(row.id)
                      }
                    }}
                    style={{
                      position: 'relative', borderRadius: 16,
                      border: isSelected ? '2px solid #047857' : '1px solid #e5e7eb',
                      background: '#fff', overflow: 'hidden', cursor: 'pointer',
                      transition: 'all 0.2s', opacity: isSelected ? 1 : 0.7,
                      boxShadow: isSelected ? '0 4px 12px rgba(4,120,87,0.1)' : 'none'
                    }}
                  >
                    <div style={{ width: '100%', aspectRatio: '1', position: 'relative', background: '#f3f4f6' }}>
                      {(row.customPhotoDataUrl || row.stockImage) ? (
                        <img src={row.customPhotoDataUrl || row.stockImage} alt={row.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🌱</div>
                      )}
                      {isSelected && (
                        <div style={{ position: 'absolute', top: 8, right: 8, background: '#047857', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✓</div>
                      )}
                    </div>
                    <div style={{ padding: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
                      <div style={{ fontSize: 13, color: isSelected ? '#047857' : '#6b7280', fontWeight: isSelected ? 600 : 400, marginTop: 4 }}>
                        {isSelected ? `$${parseFloat(row.priceUsd || '0').toFixed(2)} / ${row.unit}` : 'Tap to add'}
                      </div>
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
                    priceUsd: '',
                    isFree: false,
                    stockImage: '',
                    customPhotoDataUrl: null,
                    catalogItemId: null,
                    harvestedAt: null
                  }
                  setProduceRows(prev => [...prev, newRow])
                  setEditingRowId(newId)
                }}
                style={{
                  borderRadius: 16,
                  border: '2px dashed #16a34a',
                  background: '#f0fdf4',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  minHeight: 180,
                  padding: 16,
                  textAlign: 'center',
                  gap: 8,
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>+</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>Add Custom Item</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Tap to add any crop or item</div>
              </div>
            </div>

            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px)) 16px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center', zIndex: 10 }}>
              <button 
                onClick={() => setWizardStep(2)}
                disabled={isCartEmpty}
                style={{
                  width: '100%', maxWidth: 600, padding: '16px', borderRadius: 100,
                  background: isCartEmpty ? '#e5e7eb' : '#047857', color: isCartEmpty ? '#9ca3af' : '#fff',
                  fontSize: 16, fontWeight: 600, border: 'none', cursor: isCartEmpty ? 'not-allowed' : 'pointer',
                  boxShadow: isCartEmpty ? 'none' : '0 4px 12px rgba(4,120,87,0.2)'
                }}
              >
                Sell My Items ({selectedRows.length} selected)
              </button>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="wizard-step-2" style={{ paddingBottom: 120 }}>
            <button onClick={() => setWizardStep(1)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 15, padding: 0, marginBottom: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              ← Back to items
            </button>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 24 }}>How should buyers get this?</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32, width: '100%', boxSizing: 'border-box' }}>
              {/* Delivery Option */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: offersDelivery ? '#f0fdf4' : '#fff', overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
                <label style={{ display: 'flex', gap: 12, padding: 16, cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                  <input type="checkbox" checked={offersDelivery} onChange={(e) => setOffersDelivery(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#047857', marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, color: '#111827' }}>I can deliver to neighbors</div>
                  </div>
                </label>

                {offersDelivery && (
                  <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid #dcfce7', paddingTop: 12, width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Delivery ZIP Code(s)</label>
                        <button type="button" onClick={() => handleGeolocate('delivery')} style={{ background: 'none', border: 'none', color: '#047857', fontSize: 13, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
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
                        }} 
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, boxSizing: 'border-box', background: '#fff' }} 
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Delivery Schedule</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: deliveryPreset === 'custom' ? 12 : 0 }}>
                        <button 
                          type="button" 
                          onClick={() => {
                            setDeliveryPreset('weekday_evenings')
                            setSelectedDeliveryWindows(['weekday_evenings'])
                            setCustomDeliveryWindows(getWindowsForPreset('weekday_evenings'))
                          }} 
                          style={{ padding: '8px 12px', background: deliveryPreset === 'weekday_evenings' ? '#d1fae5' : '#fff', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: deliveryPreset === 'weekday_evenings' ? '1px solid #047857' : '1px solid #d1d5db', color: deliveryPreset === 'weekday_evenings' ? '#065f46' : '#374151' }}>
                          🌆 Weekday evenings
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setDeliveryPreset('weekend_mornings')
                            setSelectedDeliveryWindows(['weekend_mornings'])
                            setCustomDeliveryWindows(getWindowsForPreset('weekend_mornings'))
                          }} 
                          style={{ padding: '8px 12px', background: deliveryPreset === 'weekend_mornings' ? '#d1fae5' : '#fff', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: deliveryPreset === 'weekend_mornings' ? '1px solid #047857' : '1px solid #d1d5db', color: deliveryPreset === 'weekend_mornings' ? '#065f46' : '#374151' }}>
                          🌅 Weekend mornings
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setDeliveryPreset('both')
                            setSelectedDeliveryWindows(['weekday_evenings', 'weekend_mornings'])
                            setCustomDeliveryWindows(getWindowsForPreset('both'))
                          }} 
                          style={{ padding: '8px 12px', background: deliveryPreset === 'both' ? '#d1fae5' : '#fff', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: deliveryPreset === 'both' ? '1px solid #047857' : '1px solid #d1d5db', color: deliveryPreset === 'both' ? '#065f46' : '#374151' }}>
                          ☀️ Both (Recommended)
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setDeliveryPreset('custom')} 
                          style={{ padding: '8px 12px', background: deliveryPreset === 'custom' ? '#d1fae5' : '#fff', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: deliveryPreset === 'custom' ? '1px solid #047857' : '1px solid #d1d5db', color: deliveryPreset === 'custom' ? '#065f46' : '#374151' }}>
                          📅 Custom schedule
                        </button>
                      </div>

                      {deliveryPreset === 'custom' && (
                        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginTop: 8, overflowX: 'auto' }}>
                          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, textAlign: 'center' }}>Tap any hour cell to set custom delivery hours</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center' }}>
                            <thead>
                              <tr>
                                <th style={{ width: 32, padding: '4px 2px' }}></th>
                                {dayOptions.map(d => (
                                  <th key={d.date} style={{ padding: '4px 2px', fontWeight: 600, color: '#4b5563' }}>
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
                                    <td style={{ color: '#9ca3af', padding: '3px 0', fontSize: 10 }}>{hourLabel}</td>
                                    {dayOptions.map(opt => {
                                      const isSelected = isHourSelected(hour, customDeliveryWindows[opt.date] || [])
                                      return (
                                        <td
                                          key={opt.date}
                                          onClick={() => toggleHourCell(opt.date, hour, customDeliveryWindows, setCustomDeliveryWindows)}
                                          style={{
                                            height: 22,
                                            border: '1px solid #f3f4f6',
                                            background: isSelected ? '#047857' : '#f9fafb',
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
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: offersPickup ? '#f0fdf4' : '#fff', overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
                <label style={{ display: 'flex', gap: 12, padding: 16, cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                  <input type="checkbox" checked={offersPickup} onChange={(e) => setOffersPickup(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#047857', marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, color: '#111827' }}>Buyers can pick up from me</div>
                    <div style={{ fontSize: 13, color: '#4b5563', marginTop: 2 }}>They will come to your address</div>
                  </div>
                </label>

                {offersPickup && (
                  <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid #dcfce7', paddingTop: 12, width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Pickup Address</label>
                        <button type="button" onClick={() => handleGeolocate('pickup')} style={{ background: 'none', border: 'none', color: '#047857', fontSize: 13, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                          {geolocatingPickup ? '📍 Locating...' : '📍 Use current location'}
                        </button>
                      </div>
                      <input type="text" placeholder="123 Apple Tree Ln" value={pickupAddr.street} onChange={e => setPickupAddr({...pickupAddr, street: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, marginBottom: 8, boxSizing: 'border-box', background: '#fff' }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, width: '100%', boxSizing: 'border-box' }}>
                        <input type="text" placeholder="City" value={pickupAddr.city} onChange={e => setPickupAddr({...pickupAddr, city: e.target.value})} style={{ width: '100%', minWidth: 0, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, boxSizing: 'border-box', background: '#fff' }} />
                        <input type="text" placeholder="ZIP" value={pickupAddr.zip} onChange={e => setPickupAddr({...pickupAddr, zip: e.target.value})} style={{ width: '100%', minWidth: 0, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, boxSizing: 'border-box', background: '#fff' }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Pickup Schedule</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: pickupPreset === 'custom' ? 12 : 0 }}>
                        <button 
                          type="button" 
                          onClick={() => {
                            setPickupPreset('weekday_evenings')
                            setSelectedPickupWindows(['weekday_evenings'])
                            setCustomPickupWindows(getWindowsForPreset('weekday_evenings'))
                          }} 
                          style={{ padding: '8px 12px', background: pickupPreset === 'weekday_evenings' ? '#d1fae5' : '#fff', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: pickupPreset === 'weekday_evenings' ? '1px solid #047857' : '1px solid #d1d5db', color: pickupPreset === 'weekday_evenings' ? '#065f46' : '#374151' }}>
                          🌆 Weekday evenings
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setPickupPreset('weekend_mornings')
                            setSelectedPickupWindows(['weekend_mornings'])
                            setCustomPickupWindows(getWindowsForPreset('weekend_mornings'))
                          }} 
                          style={{ padding: '8px 12px', background: pickupPreset === 'weekend_mornings' ? '#d1fae5' : '#fff', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: pickupPreset === 'weekend_mornings' ? '1px solid #047857' : '1px solid #d1d5db', color: pickupPreset === 'weekend_mornings' ? '#065f46' : '#374151' }}>
                          🌅 Weekend mornings
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setPickupPreset('both')
                            setSelectedPickupWindows(['weekday_evenings', 'weekend_mornings'])
                            setCustomPickupWindows(getWindowsForPreset('both'))
                          }} 
                          style={{ padding: '8px 12px', background: pickupPreset === 'both' ? '#d1fae5' : '#fff', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: pickupPreset === 'both' ? '1px solid #047857' : '1px solid #d1d5db', color: pickupPreset === 'both' ? '#065f46' : '#374151' }}>
                          ☀️ Both (Recommended)
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setPickupPreset('custom')} 
                          style={{ padding: '8px 12px', background: pickupPreset === 'custom' ? '#d1fae5' : '#fff', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: pickupPreset === 'custom' ? '1px solid #047857' : '1px solid #d1d5db', color: pickupPreset === 'custom' ? '#065f46' : '#374151' }}>
                          📅 Custom schedule
                        </button>
                      </div>

                      {pickupPreset === 'custom' && (
                        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginTop: 8, overflowX: 'auto' }}>
                          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, textAlign: 'center' }}>Tap any hour cell to set custom pickup hours</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center' }}>
                            <thead>
                              <tr>
                                <th style={{ width: 32, padding: '4px 2px' }}></th>
                                {dayOptions.map(d => (
                                  <th key={d.date} style={{ padding: '4px 2px', fontWeight: 600, color: '#4b5563' }}>
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
                                    <td style={{ color: '#9ca3af', padding: '3px 0', fontSize: 10 }}>{hourLabel}</td>
                                    {dayOptions.map(opt => {
                                      const isSelected = isHourSelected(hour, customPickupWindows[opt.date] || [])
                                      return (
                                        <td
                                          key={opt.date}
                                          onClick={() => toggleHourCell(opt.date, hour, customPickupWindows, setCustomPickupWindows)}
                                          style={{
                                            height: 22,
                                            border: '1px solid #f3f4f6',
                                            background: isSelected ? '#047857' : '#f9fafb',
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

            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Complete Your Setup</h2>
            <div style={{ padding: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#374151' }}>Your Name or Stand Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. John's Farm Stand" 
                  value={authName} 
                  onChange={(e) => setAuthName(e.target.value)} 
                  style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} 
                />
              </div>

              <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#475569', marginBottom: 16 }}>
                <strong>Transparent Pricing:</strong> No listing fees. CasaGrown takes a 10% platform fee only when you make a sale.
              </div>

              {globalError && <div style={{ padding: 12, background: '#fef2f2', color: '#991b1b', borderRadius: 8, fontSize: 14, marginBottom: 16 }}>{globalError}</div>}

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, color: '#4b5563' }}>
                  <input 
                    type="checkbox" 
                    id="tos-checkbox"
                    checked={agreedTos} 
                    onChange={e => setAgreedTos(e.target.checked)} 
                    style={{ width: 18, height: 18, accentColor: '#047857', marginTop: 2, cursor: 'pointer' }} 
                  />
                  <span>
                    I agree to the <button type="button" onClick={(e) => {e.preventDefault(); setLegalModalContent('tos')}} style={{background:'none',border:'none',color:'#047857',textDecoration:'underline',cursor:'pointer',padding:0}}>Terms of Service</button> and <button type="button" onClick={(e) => {e.preventDefault(); setLegalModalContent('privacy')}} style={{background:'none',border:'none',color:'#047857',textDecoration:'underline',cursor:'pointer',padding:0}}>Privacy Policy</button>
                  </span>
                </div>
              </div>

              {/* Login UI if guest, else Submit Button */}
              {(!user) ? (
                <div style={{ marginTop: 24, borderTop: '1px solid #e5e7eb', paddingTop: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Sign in to publish your listings</h3>
                  <button 
                    type="button"
                    onClick={() => handleOAuthLogin('google')} 
                    style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: 8, 
                      background: '#fff', 
                      border: '1.5px solid #d1d5db', 
                      borderRadius: 10, 
                      padding: '11px 14px', 
                      fontSize: '0.95rem', 
                      fontWeight: 600, 
                      color: '#374151', 
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
                      background: '#fff', 
                      border: '1.5px solid #d1d5db', 
                      borderRadius: 10, 
                      padding: '11px 14px', 
                      fontSize: '0.95rem', 
                      fontWeight: 600, 
                      color: '#374151', 
                      cursor: 'pointer', 
                      marginBottom: 16,
                      boxSizing: 'border-box'
                    }}>
                    <span style={{ fontSize: '15px' }}></span> Continue with Apple
                  </button>
                  <div style={{ textAlign: 'center', marginBottom: 16, color: '#6b7280', fontSize: 14 }}>or</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="email" placeholder="Email address" value={authEmail} onChange={e => setAuthEmail(e.target.value)} style={{ flex: 1, padding: 12, border: '1px solid #d1d5db', borderRadius: 8, boxSizing: 'border-box', minWidth: 0 }} />
                    <button onClick={handleSendOtp} disabled={!authEmail || isSubmitting} style={{ padding: '0 20px', background: '#047857', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Get Code</button>
                  </div>
                  {(modalStep === 'otp') && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <input type="text" placeholder="6-digit code" value={authOtp} onChange={e => setAuthOtp(e.target.value)} style={{ flex: 1, padding: 12, border: '1px solid #d1d5db', borderRadius: 8, boxSizing: 'border-box', minWidth: 0 }} />
                      <button onClick={handleVerifyOtp} disabled={!authOtp || isSubmitting} style={{ padding: '0 20px', background: '#047857', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Verify & Publish</button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 13, color: '#4b5563', padding: '8px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <span>Signed in as <strong>{user?.email || authName || 'Seller'}</strong></span>
                    <button 
                      type="button" 
                      onClick={async () => {
                        await supabase.auth.signOut()
                        if (refreshAuth) await refreshAuth()
                        window.location.reload()
                      }} 
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 13, fontWeight: 500 }}
                    >
                      Sign out
                    </button>
                  </div>
                  <button 
                    type="button"
                    onClick={handleFinalPublishSubmit}
                    disabled={isSubmitting || !agreedTos || (!offersDelivery && !offersPickup)}
                    style={{ width: '100%', padding: '16px', borderRadius: 8, background: isSubmitting || !agreedTos || (!offersDelivery && !offersPickup) ? '#e5e7eb' : '#047857', color: isSubmitting || !agreedTos || (!offersDelivery && !offersPickup) ? '#9ca3af' : '#fff', fontSize: 16, fontWeight: 600, border: 'none', cursor: isSubmitting || !agreedTos || (!offersDelivery && !offersPickup) ? 'not-allowed' : 'pointer' }}
                  >
                    {isSubmitting ? 'Publishing...' : `Publish ${selectedRows.length} ${selectedRows.length === 1 ? 'Listing' : 'Listings'}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {editingRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 600, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '24px 24px calc(48px + env(safe-area-inset-bottom, 0px)) 24px', maxHeight: '88dvh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{editingRow.name || 'Add New Item'}</h3>
              <button onClick={() => setEditingRowId(null)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>

            {(!editingRow.stockImage || !editingRow.name) && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>Item Name</label>
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
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '15px', boxSizing: 'border-box' }} 
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 100, height: 100, borderRadius: 12, background: '#f3f4f6', overflow: 'hidden', position: 'relative', border: '1px solid #e5e7eb' }}>
                  {(editingRow.customPhotoDataUrl || editingRow.stockImage) ? (
                    <img src={editingRow.customPhotoDataUrl || editingRow.stockImage} alt="Item" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🌱</div>
                  )}
                </div>
                <button 
                  onClick={() => setActiveCameraRowId(editingRow.id)} 
                  style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 100, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                >
                  <span style={{ fontSize: 14 }}>📷</span> Change Photo
                </button>
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>Price ($)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="number" step="0.25" value={editingRow.priceUsd} onChange={(e) => handleUpdateRow(editingRow.id, { priceUsd: e.target.value })} style={{ flex: 1, minWidth: 0, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '16px', color: '#111827' }} />
                    <span style={{ alignSelf: 'center', color: '#6b7280' }}>per</span>
                    <select value={editingRow.unit} onChange={(e) => handleUpdateRow(editingRow.id, { unit: e.target.value })} style={{ flex: 1, minWidth: 0, padding: '8px 8px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '16px', background: '#fff', color: '#111827', appearance: 'auto', textOverflow: 'ellipsis' }}>
                      <option value="lb" style={{ color: '#000', fontSize: '16px' }}>lb</option>
                      <option value="each" style={{ color: '#000', fontSize: '16px' }}>each</option>
                      <option value="bunch" style={{ color: '#000', fontSize: '16px' }}>bunch</option>
                      <option value="dozen" style={{ color: '#000', fontSize: '16px' }}>dozen</option>
                      <option value="oz" style={{ color: '#000', fontSize: '16px' }}>oz</option>
                      <option value="bag" style={{ color: '#000', fontSize: '16px' }}>bag</option>
                      <option value="basket" style={{ color: '#000', fontSize: '16px' }}>basket</option>
                      <option value="box" style={{ color: '#000', fontSize: '16px' }}>box</option>
                      <option value="pint" style={{ color: '#000', fontSize: '16px' }}>pint</option>
                      <option value="quart" style={{ color: '#000', fontSize: '16px' }}>quart</option>
                      <option value="jar" style={{ color: '#000', fontSize: '16px' }}>jar</option>
                      <option value="loaf" style={{ color: '#000', fontSize: '16px' }}>loaf</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>Total available to sell</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="number" value={editingRow.quantity} onChange={(e) => handleUpdateRow(editingRow.id, { quantity: e.target.value })} style={{ flex: 1, minWidth: 0, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '16px', color: '#111827', boxSizing: 'border-box' }} />
                    <span style={{ color: '#4b5563', fontSize: 14, minWidth: '50px' }}>
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
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>
                🌾 Harvest Date <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
              </label>
              <input 
                type="date" 
                value={editingRow.harvestedAt || ''} 
                onChange={(e) => handleUpdateRow(editingRow.id, { harvestedAt: e.target.value || null })} 
                max={new Date().toISOString().split('T')[0]} 
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '15px', boxSizing: 'border-box', background: '#fff', color: '#111827' }} 
              />
              {editingRow.harvestedAt && (
                <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4, fontWeight: 600 }}>
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
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>Brief description (optional)</label>
              <textarea value={editingRow.description} onChange={(e) => handleUpdateRow(editingRow.id, { description: e.target.value })} placeholder="e.g., Picked fresh this morning! Very sweet." rows={2} style={{ width: '100%', padding: 12, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>

            {rowErrors[editingRow.id] && (
              <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                ⚠️ {rowErrors[editingRow.id]}
              </div>
            )}

            <button 
              type="button"
              disabled={!!rowErrors[editingRow.id]}
              onClick={() => {
                const currentQty = (!editingRow.quantity || parseInt(editingRow.quantity, 10) <= 0) ? '5' : editingRow.quantity
                const currentPrice = (!editingRow.priceUsd || (parseFloat(editingRow.priceUsd) <= 0 && !editingRow.isFree)) ? '3.00' : editingRow.priceUsd
                handleUpdateRow(editingRow.id, { isSelected: true, quantity: currentQty, priceUsd: currentPrice })
                setEditingRowId(null)
              }} 
              style={{ width: '100%', padding: 16, background: rowErrors[editingRow.id] ? '#e5e7eb' : '#047857', color: rowErrors[editingRow.id] ? '#9ca3af' : '#fff', fontSize: 16, fontWeight: 600, border: 'none', borderRadius: 8, cursor: rowErrors[editingRow.id] ? 'not-allowed' : 'pointer' }}
            >
              Save Details
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" onClick={() => { handleUpdateRow(editingRow.id, { isSelected: false }); setEditingRowId(null) }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer' }}>Remove Item</button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Terms of Service / Privacy Policy In-Modal Overlay */}
      {legalModalContent && (
        <>
          <div onClick={() => setLegalModalContent(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10000, background: '#ffffff', borderRadius: 16, width: '90%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{legalModalContent === 'tos' ? '📜 Terms of Service' : '🔒 Privacy Policy'}</h3>
              <button type="button" onClick={() => setLegalModalContent(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>✕</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {(legalModalContent === 'tos' ? TERMS_SECTIONS : PRIVACY_SECTIONS).map((section, si) => (
                <div key={si} style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: '0.95rem', color: '#1e293b', marginBottom: 8, fontWeight: 700 }}>{section.title}</h4>
                  {section.paragraphs.map((p, pi) => <p key={pi} style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.55, marginBottom: 8 }}>{p}</p>)}
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setLegalModalContent(null)} style={{ background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Close</button>
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
        />
      )}
    </div>
  )
}
