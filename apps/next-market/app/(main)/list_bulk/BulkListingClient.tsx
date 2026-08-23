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
  const [offersDelivery, setOffersDelivery] = useState(false)
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
      const label =
        offset === 0
          ? `Today (${DAY_SHORT[d.getDay()]})`
          : offset === 1
          ? `Tomorrow (${DAY_SHORT[d.getDay()]})`
          : `${DAY_SHORT[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
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
      const rows = parsedNames.map((name, i) => createRowFromProduceName(name, `url_row_${i}`))
      setProduceRows(rows)
      rows.forEach((r, idx) => {
        trackFieldInteract(PAGE_SLUG, 1, `row_${idx}_name_auto`, true)
      })
    } else {
      // Default when no produce param in URL: start with 0 rows
      setProduceRows([])
    }
  }, [searchParams])

  // ── 2. Auto-Detect Location / Prefill Booth if Logged In ──
  useEffect(() => {
    async function loadLocationOrBooth() {
      if (user?.id) {
        // Fetch existing default booth ID only (do NOT pre-select delivery/pickup or prefill default pickup address)
        try {
          const { data: userBooths } = await supabase
            .from('market_booths')
            .select('id, booth_zip, delivery_zipcodes, is_default')
            .eq('owner_id', user.id)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)

          const booth = userBooths?.[0]
          if (booth) {
            setExistingBoothId(booth.id)
            if (!zipcode) {
              if (booth.delivery_zipcodes && booth.delivery_zipcodes.length > 0) {
                setZipcode(booth.delivery_zipcodes[0])
                setDeliveryZipcodes(booth.delivery_zipcodes)
              } else if (booth.booth_zip) {
                setZipcode(booth.booth_zip)
                setDeliveryZipcodes([booth.booth_zip])
              }
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
    const setAddr = type === 'delivery' ? setDeliveryBaseAddr : setPickupAddr
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
            const zipVal = addr.postcode || ''
            const newAddr: AddressFields = {
              street: `${houseNumber} ${road}`.trim(),
              city: addr.city || addr.town || addr.village || '',
              state: mappedState,
              zip: zipVal,
            }
            setAddr(newAddr)
            if (zipVal && !zipcode) setZipcode(zipVal)
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
        setModalStep('review')
        trackEvent('wizard_step', PAGE_SLUG, { step_index: 3, step_name: 'review_and_tos' })
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

      const deliveryWindows =
        deliveryPreset === 'custom'
          ? customDeliveryWindows
          : getWindowsForPreset(deliveryPreset)

      const pickupWindows =
        pickupPreset === 'custom'
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
      const pickupStr = offersPickup && isAddressComplete(pickupAddr) ? formatFullAddress(pickupAddr) : null

      if (!targetBoothId) {
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('create_stand', {
            p_name: standName,
            p_pickup_address: pickupStr,
            p_offers_delivery: offersDelivery,
            p_offers_pickup: offersPickup,
            p_delivery_radius_miles: offersDelivery ? deliveryRadius : null,
            p_delivery_zipcodes: offersDelivery && deliveryZipcodes.length > 0 ? deliveryZipcodes : (finalZip ? [finalZip] : []),
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
              delivery_zipcodes: offersDelivery && deliveryZipcodes.length > 0 ? deliveryZipcodes : (finalZip ? [finalZip] : []),
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
          delivery_zipcodes: offersDelivery && deliveryZipcodes.length > 0 ? deliveryZipcodes : (finalZip ? [finalZip] : []),
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
          harvested_at: new Date().toISOString(),
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

  return (
    <div className={styles.container}>
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {/* Camera Capture Modal */}
      {activeCameraRowId && (
        <CameraCapture
          onCapture={handlePhotoCaptured}
          onClose={() => setActiveCameraRowId(null)}
        />
      )}

      {/* Main Container */}
      <main className={styles.mainContent}>
        {/* Header Hero */}
        <div className={styles.headerSection}>
          <div className={styles.badge}>
            ✨ Fast Bulk Produce Listing • 100% Free to List
          </div>
          <h1 className={styles.title}>
            List Your Backyard Harvest <span className={styles.highlight}>in Seconds</span>
          </h1>
          <p className={styles.subtitle}>
            Review what you have ready, adjust your prices, and connect directly with local neighbors.
          </p>
        </div>

        {/* Informative Guidance Banner */}
        <div className={styles.banner}>
          <span>💡</span>
          <div>
            <strong>How it works:</strong> Fill in rows for produce you want to sell or give away. Unfilled rows are automatically skipped.
          </div>
        </div>

        {globalError && <div className={styles.errorBanner}>⚠️ {globalError}</div>}

        {/* Main Listing Card */}
        <div className={styles.formCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                🧺 Your Produce Items ({validFilledRows.length} of {produceRows.length} ready to publish)
              </h2>
              {produceRows.length > 0 && (
                <button
                  type="button"
                  className={styles.bulkActionLink}
                  onClick={handleToggleSelectAll}
                >
                  {allSelected ? '✕ Deselect All' : '✓ Select All'}
                </button>
              )}
            </div>
            <button type="button" className={styles.addRowBtn} onClick={handleAddRow}>
              + Add Another Produce
            </button>
          </div>

          {/* Empty Grid Card when no produce rows */}
          {produceRows.length === 0 ? (
            <div className={styles.emptyGridCard}>
              <span className={styles.emptyGridIcon}>🌱</span>
              <h3 className={styles.emptyGridTitle}>No produce items added yet</h3>
              <p className={styles.emptyGridSubtitle}>
                Add produce from your garden or backyard farm to sell or share with your neighborhood community.
              </p>
              <button
                type="button"
                className={styles.addRowBtn}
                onClick={handleAddRow}
                style={{ marginTop: 8, padding: '10px 20px', fontSize: '0.95rem' }}
              >
                + Add Produce Item
              </button>
            </div>
          ) : (
            /* Produce Row Cards */
            <div className={styles.produceGrid}>
              {produceRows.map((row, index) => {
                const hasError = !!rowErrors[row.id]
                return (
                  <div
                    key={row.id}
                    className={`${styles.produceCard} ${row.isSelected ? styles.produceCardSelected : styles.produceCardUnselected} ${hasError ? styles.produceCardError : ''}`}
                  >
                    {/* Card Header with Checkbox & Delete */}
                    <div className={styles.cardHeader}>
                      <label className={styles.cardCheckboxLabel}>
                        <input
                          type="checkbox"
                          checked={row.isSelected}
                          onChange={e => {
                            const checked = e.target.checked
                            handleUpdateRow(row.id, {
                              isSelected: checked,
                              quantity: checked && !row.quantity ? '5' : row.quantity,
                            })
                          }}
                          className={styles.cardCheckbox}
                        />
                        <span className={styles.cardCheckboxText}>
                          {row.isSelected ? 'Include in Stand Listing' : 'Click to include in listing'}
                        </span>
                      </label>

                      <button
                        type="button"
                        className={styles.deleteCardBtn}
                        onClick={() => handleRemoveRow(row.id)}
                        title="Remove item"
                      >
                        🗑️ Remove
                      </button>
                    </div>

                    {/* Card Body */}
                    <div className={styles.cardBody}>
                      {/* Left: Photo Column with Preview & Camera/Upload Buttons */}
                      <div className={styles.photoColumn}>
                        <div
                          className={styles.photoBox}
                          onClick={() => triggerFileUpload(row.id)}
                          title="Click to upload photo"
                        >
                          {row.customPhotoDataUrl || row.stockImage ? (
                            <>
                              <img
                                src={row.customPhotoDataUrl || row.stockImage}
                                alt={row.name || 'Produce'}
                                className={styles.photoImage}
                              />
                              <div className={styles.photoOverlay}>
                                <span>📷</span>
                                <span>{row.customPhotoDataUrl ? 'Change' : 'Upload'}</span>
                              </div>
                              {row.customPhotoDataUrl && (
                                <div className={styles.customBadge}>Custom</div>
                              )}
                            </>
                          ) : (
                            <div className={styles.photoPlaceholder}>
                              <span style={{ fontSize: '1.4rem' }}>📷</span>
                              <span style={{ fontSize: '0.62rem', fontWeight: 700 }}>Upload</span>
                            </div>
                          )}
                        </div>
                        <div className={styles.photoBtnGroup}>
                          <button
                            type="button"
                            className={styles.photoBtn}
                            onClick={() => setActiveCameraRowId(row.id)}
                            title="Take photo with camera"
                          >
                            📸 Camera
                          </button>
                          <button
                            type="button"
                            className={styles.photoBtn}
                            onClick={() => triggerFileUpload(row.id)}
                            title="Upload image from device"
                          >
                            📁 Upload
                          </button>
                        </div>
                      </div>

                      {/* Right: Spacious Form Fields */}
                      <div className={styles.cardFields}>
                        {/* Produce Name */}
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Produce Name *</label>
                          <input
                            type="text"
                            placeholder="e.g. Meyer Lemons"
                            value={row.name}
                            onChange={e => handleUpdateRow(row.id, { name: e.target.value })}
                            onBlur={() => trackFieldInteract(PAGE_SLUG, 1, `row_${index}_name`, !!row.name.trim())}
                            className={`${styles.input} ${hasError ? styles.inputError : ''}`}
                          />
                          {hasError && (
                            <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
                              {rowErrors[row.id]}
                            </span>
                          )}
                        </div>

                        {/* 1-Line Description */}
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>1-Line Note / Description</label>
                          <input
                            type="text"
                            placeholder="e.g. Sweet, juicy, picked fresh this morning"
                            value={row.description}
                            onChange={e => handleUpdateRow(row.id, { description: e.target.value })}
                            onBlur={() => trackFieldInteract(PAGE_SLUG, 1, `row_${index}_description`, !!row.description.trim())}
                            className={styles.input}
                          />
                        </div>

                        {/* Quantity, Unit, Price, Free Toggle */}
                        <div className={styles.pricingRow}>
                          <div className={styles.fieldGroup} style={{ flex: '0 0 90px' }}>
                            <label className={styles.fieldLabel}>Quantity</label>
                            <input
                              type="number"
                              min="1"
                              placeholder="e.g. 5"
                              value={row.quantity}
                              onChange={e => handleUpdateRow(row.id, { quantity: e.target.value })}
                              onBlur={() => trackFieldInteract(PAGE_SLUG, 1, `row_${index}_qty`, !!String(row.quantity).trim())}
                              className={styles.input}
                            />
                          </div>

                          <div className={styles.fieldGroup} style={{ flex: '0 0 115px' }}>
                            <label className={styles.fieldLabel}>Unit</label>
                            <select
                              value={row.unit}
                              onChange={e => handleUpdateRow(row.id, { unit: e.target.value })}
                              className={styles.select}
                            >
                              {ALLOWED_UNITS.map(u => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className={styles.fieldGroup} style={{ flex: '1 1 140px' }}>
                            <label className={styles.fieldLabel}>Price ($)</label>
                            {row.isFree ? (
                              <div className={styles.freePill}>FREE</div>
                            ) : (
                              <div className={styles.priceWrapper}>
                                <span className={styles.pricePrefix}>$</span>
                                <input
                                  type="number"
                                  step="0.25"
                                  min="0"
                                  placeholder="0.00"
                                  value={row.priceUsd}
                                  onChange={e => handleUpdateRow(row.id, { priceUsd: e.target.value })}
                                  onBlur={() => trackFieldInteract(PAGE_SLUG, 1, `row_${index}_price`, !!String(row.priceUsd).trim())}
                                  className={`${styles.input} ${styles.priceInput}`}
                                />
                              </div>
                            )}
                          </div>

                          <label className={styles.freeToggleWrapper}>
                            <input
                              type="checkbox"
                              checked={row.isFree}
                              onChange={e =>
                                handleUpdateRow(row.id, {
                                  isFree: e.target.checked,
                                  priceUsd: e.target.checked ? '0' : row.priceUsd,
                                })
                              }
                              className={styles.freeCheckbox}
                            />
                            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
                              Make Free
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ─── Fulfillment Options ─── */}
          <div className={styles.fulfillmentContainer}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>🚚 Delivery & Pickup Options</h2>
              <span className={styles.fulfillmentRequiredBadge}>
                Choose at least one (Delivery, Pickup, or Both) *
              </span>
            </div>

            {!offersDelivery && !offersPickup && (
              <div className={styles.fulfillmentWarning}>
                <span>⚠️</span>
                <span>
                  Please select at least one fulfillment option below (<strong>Delivery</strong>, <strong>Pickup</strong>, or <strong>Both</strong>) so neighbors know how to receive your produce.
                </span>
              </div>
            )}

            <div className={styles.fulfillmentGrid}>
              {/* Delivery Box */}
              <div
                className={`${styles.toggleCard} ${offersDelivery ? styles.toggleCardSelected : ''}`}
              >
                <div
                  className={styles.toggleCardHeader}
                  onClick={() => {
                    setOffersDelivery(prev => {
                      const next = !prev
                      trackFieldInteract(PAGE_SLUG, 1, 'offers_delivery', next)
                      return next
                    })
                  }}
                >
                  <input
                    type="checkbox"
                    checked={offersDelivery}
                    onChange={() => {}}
                    className={styles.toggleCardCheckbox}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                      🚗 I can deliver to neighbors
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                      Deliver within your local area or selected ZIP codes on your scheduled days
                    </div>
                  </div>
                </div>

                {offersDelivery && (
                  <div className={styles.toggleCardBody}>
                    {/* Delivery Mode Toggle */}
                    <div className={styles.deliveryModeContainer}>
                      <label
                        className={`${styles.deliveryModeOption} ${deliveryMode === 'zipcode' ? styles.deliveryModeOptionActive : ''}`}
                        onClick={() => {
                          setDeliveryMode('zipcode')
                          trackFieldInteract(PAGE_SLUG, 1, 'delivery_mode', true)
                        }}
                      >
                        <input
                          type="radio"
                          name="deliveryMode"
                          checked={deliveryMode === 'zipcode'}
                          onChange={() => {
                            setDeliveryMode('zipcode')
                            trackFieldInteract(PAGE_SLUG, 1, 'delivery_mode', true)
                          }}
                          className={styles.deliveryModeRadio}
                        />
                        Deliver by Zip Code(s)
                      </label>
                      <label
                        className={`${styles.deliveryModeOption} ${deliveryMode === 'address_radius' ? styles.deliveryModeOptionActive : ''}`}
                        onClick={() => {
                          setDeliveryMode('address_radius')
                          trackFieldInteract(PAGE_SLUG, 1, 'delivery_mode', true)
                        }}
                      >
                        <input
                          type="radio"
                          name="deliveryMode"
                          checked={deliveryMode === 'address_radius'}
                          onChange={() => {
                            setDeliveryMode('address_radius')
                            trackFieldInteract(PAGE_SLUG, 1, 'delivery_mode', true)
                          }}
                          className={styles.deliveryModeRadio}
                        />
                        Base Address + Delivery Radius
                      </label>
                    </div>

                    {deliveryMode === 'zipcode' ? (
                      <div className={styles.fieldGroup} style={{ marginBottom: 16 }}>
                        <label className={styles.fieldLabel}>📮 Delivery Zip Code(s) *</label>
                        <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 6px' }}>
                          Add one or multiple 5-digit ZIP codes where you deliver (press Enter, space, or comma to add).
                        </p>
                        <div className={styles.zipTagsContainer}>
                          {deliveryZipcodes.map(zip => (
                            <span key={zip} className={styles.zipTag}>
                              {zip}
                              <button
                                type="button"
                                onClick={() => handleRemoveZipTag(zip)}
                                className={styles.zipTagRemove}
                                aria-label={`Remove ${zip}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            placeholder={deliveryZipcodes.length === 0 ? "e.g. 95125, 95112" : "Add another ZIP..."}
                            value={zipInput}
                            onChange={e => {
                              const val = e.target.value
                              if (val.includes(',') || val.includes(' ')) {
                                const parts = val.split(/[,\s]+/).filter(Boolean)
                                parts.forEach(p => handleAddZipTag(p))
                                setZipInput('')
                              } else {
                                setZipInput(val.replace(/[^0-9]/g, ''))
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                                e.preventDefault()
                                if (zipInput.trim()) {
                                  handleAddZipTag(zipInput)
                                }
                              }
                            }}
                            onBlur={() => {
                              if (zipInput.trim()) {
                                handleAddZipTag(zipInput)
                              }
                              trackFieldInteract(PAGE_SLUG, 1, 'delivery_zipcodes', deliveryZipcodes.length > 0 || !!zipInput.trim())
                            }}
                            onPaste={handlePasteZips}
                            className={styles.zipTagInput}
                            maxLength={5}
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label className={styles.fieldLabel}>Home/Farm Base Address *</label>
                          <button
                            type="button"
                            onClick={() => handleGeolocate('delivery')}
                            disabled={geolocatingDelivery}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#16a34a',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: geolocatingDelivery ? 'wait' : 'pointer',
                            }}
                          >
                            {geolocatingDelivery ? '⏳ Locating...' : '📍 Use My Location'}
                          </button>
                        </div>
                        <AddressInput
                          value={deliveryBaseAddr}
                          onChange={val => {
                            setDeliveryBaseAddr(val)
                            if (val.zip && !zipcode) {
                              setZipcode(val.zip)
                              if (!deliveryZipcodes.includes(val.zip)) {
                                setDeliveryZipcodes(prev => [...prev, val.zip])
                              }
                            }
                          }}
                          onBlur={(f) => trackFieldInteract(PAGE_SLUG, 1, `delivery_base_${f}`, !!deliveryBaseAddr[f]?.trim())}
                          placeholderStreet="Base Street Address for deliveries"
                          showPrivacyNote={true}
                        />
                        {/* Radius Slider */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                            <span>Delivery Radius</span>
                            <span style={{ color: '#16a34a', fontWeight: 700 }}>{deliveryRadius} miles</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={deliveryRadius}
                            onChange={e => {
                              const r = parseInt(e.target.value, 10)
                              setDeliveryRadius(r)
                              trackFieldInteract(PAGE_SLUG, 1, 'delivery_radius', true)
                            }}
                            style={{ width: '100%', accentColor: '#16a34a' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Delivery Schedule Preset Selector */}
                    <div className={styles.presetGroup}>
                      <label className={styles.fieldLabel}>Delivery Schedule:</label>
                      {FULFILLMENT_PRESET_OPTIONS.map(p => {
                        const isActive = deliveryPreset === p.id
                        return (
                          <div
                            key={p.id}
                            className={`${styles.presetOption} ${isActive ? styles.presetOptionActive : ''}`}
                            onClick={() => {
                              setDeliveryPreset(p.id)
                              if (p.id !== 'custom') {
                                setCustomDeliveryWindows(getWindowsForPreset(p.id))
                              }
                              trackFieldInteract(PAGE_SLUG, 1, 'delivery_preset', true)
                            }}
                          >
                            <input
                              type="radio"
                              checked={isActive}
                              onChange={() => {}}
                              className={styles.presetRadio}
                            />
                            <div className={styles.presetText}>
                              <span className={styles.presetLabel}>{p.label}</span>
                              <span className={styles.presetDesc}>{p.desc}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Custom Weekly Calendar Grid Table when custom is chosen */}
                    {deliveryPreset === 'custom' && (
                      <div className={styles.gridContainer}>
                        <div className={styles.gridTitle}>Tap any hour cell to set custom delivery times</div>
                        <table className={styles.gridTable}>
                          <thead>
                            <tr>
                              <th style={{ width: 45 }}></th>
                              {dayOptions.map(d => (
                                <th key={d.date} className={styles.gridTh}>
                                  {d.label.split(' ')[0]}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: 13 }).map((_, index) => {
                              const hour = 8 + index // 8am to 8pm
                              const isPm = hour >= 12
                              const hourNum = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                              const hourLabel = `${hourNum}${isPm ? 'p' : 'a'}`

                              return (
                                <tr key={hour}>
                                  <td className={styles.gridTimeCol}>{hourLabel}</td>
                                  {dayOptions.map(opt => {
                                    const isSelected = isHourSelected(hour, customDeliveryWindows[opt.date] || [])
                                    return (
                                      <td
                                        key={opt.date}
                                        className={`${styles.gridCell} ${isSelected ? styles.gridCellActive : ''}`}
                                        onClick={() =>
                                          toggleHourCell(opt.date, hour, customDeliveryWindows, setCustomDeliveryWindows)
                                        }
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
                )}
              </div>

              {/* Pickup Box */}
              <div
                className={`${styles.toggleCard} ${offersPickup ? styles.toggleCardSelected : ''}`}
              >
                <div
                  className={styles.toggleCardHeader}
                  onClick={() => {
                    setOffersPickup(prev => {
                      const next = !prev
                      trackFieldInteract(PAGE_SLUG, 1, 'offers_pickup', next)
                      return next
                    })
                  }}
                >
                  <input
                    type="checkbox"
                    checked={offersPickup}
                    onChange={() => {}}
                    className={styles.toggleCardCheckbox}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                      🏡 Buyers can pick up from me
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                      Porch pickup or neighborhood hand-off at your address
                    </div>
                  </div>
                </div>

                {offersPickup && (
                  <div className={styles.toggleCardBody}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className={styles.fieldLabel}>Pickup Address *</label>
                      <button
                        type="button"
                        onClick={() => handleGeolocate('pickup')}
                        disabled={geolocatingPickup}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#16a34a',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: geolocatingPickup ? 'wait' : 'pointer',
                        }}
                      >
                        {geolocatingPickup ? '⏳ Locating...' : '📍 Use My Location'}
                      </button>
                    </div>
                    <AddressInput
                      value={pickupAddr}
                      onChange={val => setPickupAddr(val)}
                      onBlur={(f) => trackFieldInteract(PAGE_SLUG, 1, `pickup_${f}`, !!pickupAddr[f]?.trim())}
                      placeholderStreet="Street Address for pickup"
                      showPrivacyNote={true}
                    />

                    {/* Pickup Schedule Preset Selector */}
                    <div className={styles.presetGroup} style={{ marginTop: 16 }}>
                      <label className={styles.fieldLabel}>Pickup Schedule:</label>
                      {FULFILLMENT_PRESET_OPTIONS.map(p => {
                        const isActive = pickupPreset === p.id
                        return (
                          <div
                            key={p.id}
                            className={`${styles.presetOption} ${isActive ? styles.presetOptionActive : ''}`}
                            onClick={() => {
                              setPickupPreset(p.id)
                              if (p.id !== 'custom') {
                                setCustomPickupWindows(getWindowsForPreset(p.id))
                              }
                              trackFieldInteract(PAGE_SLUG, 1, 'pickup_preset', true)
                            }}
                          >
                            <input
                              type="radio"
                              checked={isActive}
                              onChange={() => {}}
                              className={styles.presetRadio}
                            />
                            <div className={styles.presetText}>
                              <span className={styles.presetLabel}>{p.label}</span>
                              <span className={styles.presetDesc}>{p.desc}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Custom Weekly Calendar Grid Table for Pickup */}
                    {pickupPreset === 'custom' && (
                      <div className={styles.gridContainer}>
                        <div className={styles.gridTitle}>Tap any hour cell to set custom pickup times</div>
                        <table className={styles.gridTable}>
                          <thead>
                            <tr>
                              <th style={{ width: 45 }}></th>
                              {dayOptions.map(d => (
                                <th key={d.date} className={styles.gridTh}>
                                  {d.label.split(' ')[0]}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: 13 }).map((_, index) => {
                              const hour = 8 + index // 8am to 8pm
                              const isPm = hour >= 12
                              const hourNum = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                              const hourLabel = `${hourNum}${isPm ? 'p' : 'a'}`

                              return (
                                <tr key={hour}>
                                  <td className={styles.gridTimeCol}>{hourLabel}</td>
                                  {dayOptions.map(opt => {
                                    const isSelected = isHourSelected(hour, customPickupWindows[opt.date] || [])
                                    return (
                                      <td
                                        key={opt.date}
                                        className={`${styles.gridCell} ${isSelected ? styles.gridCellActive : ''}`}
                                        onClick={() =>
                                          toggleHourCell(opt.date, hour, customPickupWindows, setCustomPickupWindows)
                                        }
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
                )}
              </div>
            </div>

            {/* Transparent Pricing & Platform Fees */}
            <div className={styles.feeNoticeCard}>
              <div className={styles.feeNoticeHeader}>
                <div className={styles.feeNoticeTitleWrapper}>
                  <span className={styles.feeNoticeIcon}>💳</span>
                  <h3 className={styles.feeNoticeTitle}>Transparent Pricing & Seller Fees</h3>
                </div>
                <span className={styles.feeNoticeBadge}>No Hidden Fees</span>
              </div>
              <div className={styles.feeNoticeGrid}>
                <div className={styles.feeNoticeItem}>
                  <div className={styles.feeNoticeItemHeader}>
                    <span className={styles.feeCheckmark}>✓</span>
                    <span className={styles.feeItemTitle}>$0 Listing Fee</span>
                  </div>
                  <p className={styles.feeItemDescription}>
                    Listing fresh produce is <strong>100% free</strong>. There are no monthly subscriptions, upfront setup costs, or recurring fees.
                  </p>
                </div>
                <div className={styles.feeNoticeItem}>
                  <div className={styles.feeNoticeItemHeader}>
                    <span className={styles.feeCheckmark}>✓</span>
                    <span className={styles.feeItemTitle}>10% Standard Platform Fee on Sale</span>
                  </div>
                  <p className={styles.feeItemDescription}>
                    CasaGrown charges a 10% platform fee <em>only upon a successful sale</em>, which is <strong>all-inclusive of Stripe payment processing and credit card transaction fees</strong>. You keep 90% of your listed earnings.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Bottom Publish Bar */}
      <div className={styles.submitBar}>
        <div className={styles.submitInfo}>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
            {validFilledRows.length} produce {validFilledRows.length === 1 ? 'item' : 'items'} ready to publish
          </div>
          <div
            style={{
              fontSize: '0.78rem',
              color: !isFulfillmentValid && validFilledRows.length > 0 ? '#b45309' : '#64748b',
              fontWeight: !isFulfillmentValid && validFilledRows.length > 0 ? 700 : 400,
            }}
          >
            {publishButtonHint}
          </div>
        </div>

        <button
          type="button"
          className={styles.publishBtn}
          onClick={handlePublishClick}
          disabled={isSubmitting || validFilledRows.length === 0 || !isFulfillmentValid}
        >
          {isSubmitting
            ? '🚀 Publishing...'
            : `🚀 Publish ${validFilledRows.length} Selected ${validFilledRows.length === 1 ? 'Item' : 'Items'} to My Stand`}
        </button>
      </div>

      {/* Multi-Step Publish & Verification Modal (matching /sell) */}
      {publishModalOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalDialog}>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setPublishModalOpen(false)}
            >
              ✕
            </button>

            {/* Step Indicators */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <div
                style={{
                  height: 4,
                  flex: 1,
                  borderRadius: 2,
                  background: '#16a34a',
                }}
              />
              <div
                style={{
                  height: 4,
                  flex: 1,
                  borderRadius: 2,
                  background: modalStep === 'otp' || modalStep === 'review' ? '#16a34a' : '#e2e8f0',
                }}
              />
              <div
                style={{
                  height: 4,
                  flex: 1,
                  borderRadius: 2,
                  background: modalStep === 'review' ? '#16a34a' : '#e2e8f0',
                }}
              />
            </div>

            {/* Step 1: Contact & Auth */}
            {modalStep === 'contact' && (
              <>
                <h3 className={styles.modalTitle}>Save & Publish Your Listings</h3>
                <p className={styles.modalSubtitle}>
                  Enter your details to create your seller account and publish your harvest to local neighbors.
                </p>

                {authError && <div className={styles.modalError}>⚠️ {authError}</div>}

                {/* 1-Tap OAuth */}
                <div className={styles.socialAuthGrid}>
                  <button
                    type="button"
                    className={styles.socialBtn}
                    onClick={() => handleOAuthLogin('google')}
                  >
                    <span>🌐</span> Continue with Google
                  </button>
                  <button
                    type="button"
                    className={styles.socialBtn}
                    onClick={() => handleOAuthLogin('apple')}
                  >
                    <span>🍏</span> Continue with Apple
                  </button>
                </div>

                <div className={styles.divider}>or continue with email</div>

                <form onSubmit={handleSendOtp} className={styles.authForm}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sarah Jenkins"
                      value={authName}
                      onChange={e => setAuthName(e.target.value)}
                      className={styles.input}
                      autoFocus
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="sarah@example.com"
                      value={authEmail}
                      onChange={e => setAuthEmail(e.target.value)}
                      onBlur={() => trackFieldInteract(PAGE_SLUG, 2, 'auth_email', !!authEmail.trim())}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Phone Number (Optional - for order SMS)</label>
                    <input
                      type="tel"
                      placeholder="(555) 000-0000"
                      value={authPhone}
                      onChange={e => setAuthPhone(e.target.value)}
                      onBlur={() => trackFieldInteract(PAGE_SLUG, 2, 'auth_phone', !!authPhone.trim())}
                      className={styles.input}
                    />
                  </div>

                  {authPhone && (
                    <label className={styles.checkboxLabel} style={{ marginTop: 2 }}>
                      <input
                        type="checkbox"
                        checked={smsConsent}
                        onChange={e => setSmsConsent(e.target.checked)}
                      />
                      <span>
                        I consent to receive order notifications and pickup updates via SMS
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={isSendingOtp}
                    className={styles.modalSubmitBtn}
                  >
                    {isSendingOtp ? 'Sending Code...' : 'Continue with Email →'}
                  </button>
                </form>
              </>
            )}

            {/* Step 2: Email OTP */}
            {modalStep === 'otp' && (
              <>
                <h3 className={styles.modalTitle}>Verify Your Email</h3>
                <p className={styles.modalSubtitle}>
                  Enter the 6-digit verification code sent to <strong>{authEmail}</strong>.
                </p>

                {authError && <div className={styles.modalError}>⚠️ {authError}</div>}

                <form onSubmit={handleVerifyOtp} className={styles.authForm}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>6-Digit Code *</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="123456"
                      value={authOtp}
                      onChange={e => setAuthOtp(e.target.value.replace(/[^0-9]/g, ''))}
                      onBlur={() => trackFieldInteract(PAGE_SLUG, 2, 'auth_otp', authOtp.length === 6)}
                      className={styles.input}
                      style={{ fontSize: '1.4rem', letterSpacing: '0.25em', textAlign: 'center', fontWeight: 700 }}
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifyingOtp || authOtp.length < 6}
                    className={styles.modalSubmitBtn}
                  >
                    {isVerifyingOtp ? 'Verifying...' : 'Verify Code →'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthOtp('')
                      setModalStep('contact')
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      marginTop: 4,
                      textDecoration: 'underline',
                    }}
                  >
                    ← Use a different email
                  </button>
                </form>
              </>
            )}

            {/* Step 3: Review & Terms of Service Agreement (matching /sell Step 5) */}
            {modalStep === 'review' && (
              <>
                <h3 className={styles.modalTitle}>Review & Confirm Your Stand</h3>
                <p className={styles.modalSubtitle}>
                  Almost done! Confirm your produce items and agree to the Terms of Service to go live.
                </p>

                {authError && <div className={styles.modalError}>⚠️ {authError}</div>}

                {/* Produce & Fulfillment Summary Box */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 16,
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🧺</span>
                    <span>{validFilledRows.length} produce {validFilledRows.length === 1 ? 'item' : 'items'} ready to publish:</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {validFilledRows.map((r, ri) => (
                      <div
                        key={r.id || ri}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          gap: 10,
                          color: '#334155',
                          padding: '4px 0',
                          borderBottom: ri < validFilledRows.length - 1 ? '1px dashed #e2e8f0' : 'none',
                        }}
                      >
                        <span style={{ fontWeight: 600, wordBreak: 'break-word', flex: 1 }}>• {r.name}</span>
                        <span style={{ fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                          {r.isFree ? 'Free' : `$${r.priceUsd}/${r.unit}`} ({r.quantity} available)
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ paddingTop: 10, borderTop: '1px solid #e2e8f0', fontSize: '0.82rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.45 }}>
                    {offersDelivery && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>🚗</span>
                        <div style={{ flex: 1, wordBreak: 'break-word' }}>
                          <strong style={{ color: '#0f172a' }}>Delivery:</strong>{' '}
                          {deliveryMode === 'zipcode'
                            ? `ZIP ${deliveryZipcodes.length > 0 ? deliveryZipcodes.join(', ') : zipcode || 'None specified'}`
                            : `${deliveryRadius} miles around ${deliveryBaseAddr.street ? `${deliveryBaseAddr.street}, ${deliveryBaseAddr.city}` : 'base address'}`}
                        </div>
                      </div>
                    )}
                    {offersPickup && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>📍</span>
                        <div style={{ flex: 1, wordBreak: 'break-word' }}>
                          <strong style={{ color: '#0f172a' }}>Pickup:</strong>{' '}
                          {isAddressComplete(pickupAddr) ? formatFullAddress(pickupAddr) : 'Address provided upon checkout'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <form onSubmit={handleFinalPublishSubmit} className={styles.authForm}>
                  {/* Name field if not already set */}
                  {!authName && (
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Your Full Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sarah Jenkins"
                        value={authName}
                        onChange={e => setAuthName(e.target.value)}
                        onBlur={() => trackFieldInteract(PAGE_SLUG, 3, 'auth_name', !!authName.trim())}
                        className={styles.input}
                      />
                    </div>
                  )}

                  {/* ToS Agreement Checkbox */}
                  <div className={styles.consentGroup}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={agreedTos}
                        onChange={e => setAgreedTos(e.target.checked)}
                        required
                        style={{ width: 18, height: 18, accentColor: '#16a34a', cursor: 'pointer' }}
                      />
                      <span>
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault()
                            e.stopPropagation()
                            setLegalModalContent('tos')
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#16a34a',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: 'inherit',
                            fontFamily: 'inherit',
                            fontWeight: 700,
                          }}
                        >
                          Terms of Service
                        </button>{' '}
                        and{' '}
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault()
                            e.stopPropagation()
                            setLegalModalContent('privacy')
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#16a34a',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: 'inherit',
                            fontFamily: 'inherit',
                            fontWeight: 700,
                          }}
                        >
                          Privacy Policy
                        </button>
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !agreedTos}
                    className={styles.modalSubmitBtn}
                    style={{ fontSize: '1rem', padding: '14px' }}
                  >
                    {isSubmitting
                      ? '🚀 Publishing Your Stand...'
                      : `🌱 Complete Setup & Publish Stand`}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Embedded Terms of Service / Privacy Policy In-Modal Overlay */}
      {legalModalContent && (
        <>
          <div
            onClick={() => setLegalModalContent(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(2px)',
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10000,
              background: '#ffffff',
              borderRadius: 16,
              width: '90%',
              maxWidth: 520,
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                {legalModalContent === 'tos' ? '📜 Terms of Service' : '🔒 Privacy Policy'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModalContent(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {(legalModalContent === 'tos' ? TERMS_SECTIONS : PRIVACY_SECTIONS).map((section, si) => (
                <div key={si} style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: '0.95rem', color: '#1e293b', marginBottom: 8, fontWeight: 700 }}>
                    {section.title}
                  </h4>
                  {section.paragraphs.map((p, pi) => (
                    <p
                      key={pi}
                      style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.55, marginBottom: 8 }}
                    >
                      {p}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setLegalModalContent(null)}
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
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

