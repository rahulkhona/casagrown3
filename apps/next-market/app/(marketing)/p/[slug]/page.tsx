'use client'

import React, { useState, useEffect, Suspense, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { resetSessionId, trackFieldInteract, trackStepTiming, trackEvent } from '../../../../lib/crm-analytics'
import { ENABLE_ELITE } from '../../../../lib/featureFlags'
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '../../../(main)/terms/page'
import { StripeCheckoutModal } from '../../../components/StripeCheckoutModal'
import { FacebookStatus } from '../../../components/FacebookStatus'
import { InstagramSettings } from '../../../components/InstagramSettings'
import { GooglePlacesSettings } from '../../../components/GooglePlacesSettings'


type PromotionDetails = {
  id: string
  name: string
  description_html: string
  enrollment_deadline: string
  allow_existing_users: boolean
  is_capacity_reached?: boolean
  giveaway?: { title?: string; description?: string; start_date: string; end_date: string; photos: string[] }
  buyer_discounts?: { 
    discount_amount_usd: number; 
    discount_type: string; 
    discount_cap_type: string;
    discount_cap_value: number;
    frequency: string; 
    occurrences: number; 
    start_date: string;
    image_url?: string | null;
  }
  sub_discount?: {
    discount_pct: number;
    duration_months: number | null;
    pro_monthly_price: number;
  }
  hero_image_url: string | null
}

type PlanTier = {
  tier_name: 'lite' | 'pro' | 'elite'
  display_name: string
  subscription_price: number
  platform_fee_pct: number
  max_booths: number
  features: Record<string, boolean>
}

const STATE_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN',
  'texas': 'TX', 'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
  'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
}

const DEFAULT_TIERS: PlanTier[] = [
  {
    tier_name: 'lite',
    display_name: 'Lite Base',
    subscription_price: 0.00,
    platform_fee_pct: 10.00,
    max_booths: 1,
    features: { facebook_sync: false, growbot_copilot: false, custom_branding: false }
  },
  {
    tier_name: 'pro',
    display_name: 'CasaGrown Pro',
    subscription_price: 10.00,
    platform_fee_pct: 5.00,
    max_booths: 3,
    features: { facebook_sync: true, growbot_copilot: true, custom_branding: false }
  },
  {
    tier_name: 'elite',
    display_name: 'CasaGrown Elite',
    subscription_price: 29.00,
    platform_fee_pct: 2.00,
    max_booths: 100,
    features: { facebook_sync: true, growbot_copilot: true, custom_branding: true }
  }
]

function PromoContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const slug = params.slug as string
  const campaign_id = searchParams.get('campaign_id')
  const promo_id = searchParams.get('promo')

  const [loading, setLoading] = useState(true)
  const [promo, setPromo] = useState<PromotionDetails | null>(null)
  const [tiers, setTiers] = useState<PlanTier[]>(DEFAULT_TIERS)
  const [promoDiscounts, setPromoDiscounts] = useState<any[]>([])
  const [selectedPlan, setSelectedPlan] = useState<'lite' | 'pro' | 'elite'>('pro')
  const [errorMsg, setErrorMsg] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  const [isExistingUser, setIsExistingUser] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  // Wizard steps: 'initial' | 'profile' | 'otp' | 'promo_choice' | 'payment' | 'success' | 'booth_setup' | 'manage_features' | 'first_listing' | 'done' | 'lite_intent'
  const [step, rawSetStep] = useState<'initial' | 'profile' | 'otp' | 'promo_choice' | 'payment' | 'success' | 'booth_setup' | 'manage_features' | 'first_listing' | 'done' | 'lite_intent'>('initial')
  const setStep = (nextStep: typeof step | ((prev: typeof step) => typeof step)) => {
    if (typeof wentNext !== 'undefined') wentNext.current = true
    rawSetStep(nextStep)
  }
  const [activePromoDiscount, setActivePromoDiscount] = useState<any | null>(null)
  const [fallbackMode, setFallbackMode] = useState<{message: string} | null>(null)
  const [skipPromo, setSkipPromo] = useState(false)
  
  // Form states
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [phone, setPhone] = useState('')
  const [farmName, setFarmName] = useState('')
  const [smsConsent, setSmsConsent] = useState(true)
  const [tosAccepted, setTosAccepted] = useState(false)
  const [otp, setOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalContent, setModalContent] = useState<'tos' | 'privacy' | null>(null)

  // Downgrade selector states
  const [userBooths, setUserBooths] = useState<any[]>([])
  const [selectedBoothsToKeep, setSelectedBoothsToKeep] = useState<string[]>([])

  // Stripe Modal States
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null)

  const [locating, setLocating] = useState(false)
  const [isProTester, setIsProTester] = useState(false)

  // Post-payment onboarding wizard state
  const [boothName, setBoothName] = useState('')
  const [boothAddress, setBoothAddress] = useState('')
  const [boothCity, setBoothCity] = useState('')
  const [boothState, setBoothState] = useState('')
  const [boothZip, setBoothZip] = useState('')
  const [boothPickup, setBoothPickup] = useState(true)
  const [boothDelivery, setBoothDelivery] = useState(false)
  const [boothTimeWindows, setBoothTimeWindows] = useState('9:00 AM - 5:00 PM')
  const [boothSaving, setBoothSaving] = useState(false)
  const [listingName, setListingName] = useState('')
  const [listingPrice, setListingPrice] = useState('')
  const [listingQty, setListingQty] = useState('1')
  const [listingPhoto, setListingPhoto] = useState<File | null>(null)
  const [listingPhotoPreview, setListingPhotoPreview] = useState('')
  const [listingSaving, setListingSaving] = useState(false)
  const [onboardingCompleted, setOnboardingCompleted] = useState<{ booth: boolean; features: boolean; listing: boolean }>({ booth: false, features: false, listing: false })

  // Telemetry Hooks for /p/[slug]
  const wentNext = useRef(false)
  const prevStepRef = useRef(step)
  const stepStartRef = useRef(Date.now())

  function getStepIndex(stepName: string): number {
    switch (stepName) {
      case 'initial': return 1
      case 'profile': return 2
      case 'otp': return 3
      case 'promo_choice': return 2
      case 'lite_intent': return 2
      case 'payment': return 4
      case 'success': return 5
      case 'booth_setup': return 6
      case 'manage_features': return 7
      case 'first_listing': return 8
      case 'done': return 9
      default: return 1
    }
  }

  // 1. Session reset on mount/slug change
  useEffect(() => {
    resetSessionId(`/p/${slug}`)
    trackEvent('form_start', `/p/${slug}`, { form_version: 'v2-marketing-slug-funnel' })
    trackEvent('wizard_step', `/p/${slug}`, { step_index: 1, step_name: 'initial' })
    stepStartRef.current = Date.now()
  }, [slug])

  // 2. Step timing & step changes
  useEffect(() => {
    if (prevStepRef.current !== step) {
      const durationSecs = (Date.now() - stepStartRef.current) / 1000
      trackStepTiming(`/p/${slug}`, getStepIndex(prevStepRef.current), prevStepRef.current, durationSecs)
      trackEvent('wizard_step', `/p/${slug}`, { step_index: getStepIndex(step), step_name: step })
      prevStepRef.current = step
      stepStartRef.current = Date.now()
      wentNext.current = false // Reset wentNext on step change
    }
  }, [step, slug])

  // 3. Page unload / unmount abandonment hook
  useEffect(() => {
    const handleUnload = () => {
      if (!wentNext.current && step !== 'success' && step !== 'booth_setup' && step !== 'done') {
        const timeOnStep = (Date.now() - stepStartRef.current) / 1000
        trackEvent('wizard_abandon', `/p/${slug}`, {
          last_step: getStepIndex(step),
          last_step_name: step,
          time_on_step_secs: Math.round(timeOnStep),
          field_states: {
            email: !!email,
            name: !!name,
            phone: !!phone,
            street: !!street,
            city: !!city,
            state: !!state,
            zip: !!zip,
            farmName: !!farmName,
            smsConsent,
            selectedPlan
          }
        })
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    return () => {
      handleUnload()
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [step, slug, email, name, phone, street, city, state, zip, farmName, smsConsent, selectedPlan])

  const handleFieldBlur = (fieldName: string, value: string) => {
    trackFieldInteract(`/p/${slug}`, getStepIndex(step), fieldName, !!value.trim())
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.')
      return
    }
    setLocating(true)
    setErrorMsg('')
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`)
          if (!res.ok) throw new Error('Failed to resolve address.')
          const data = await res.json()
          const addr = data.address || {}
          
          // Street address
          const number = addr.house_number || ''
          const road = addr.road || ''
          const streetVal = [number, road].filter(Boolean).join(' ')
          setStreet(streetVal || addr.suburb || addr.neighbourhood || '')
          
          // City
          const cityVal = addr.city || addr.town || addr.village || addr.suburb || ''
          setCity(cityVal)
          
          // State
          const stateName = (addr.state || '').toLowerCase().trim()
          const stateCode = STATE_MAP[stateName] || (addr.state ? addr.state.substring(0, 2).toUpperCase() : '')
          setState(stateCode)
          
          // Zip
          const zipVal = addr.postcode || ''
          setZip(zipVal.substring(0, 5))
        } catch (err: any) {
          setErrorMsg('Could not detect address. Please enter manually.')
        } finally {
          setLocating(false)
        }
      },
      (err) => {
        setErrorMsg('Location access denied. Please enter manually.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  // Determine Fallback Background Image
  const getBackgroundImage = () => {
    return '/tote-bag-hero.png'
  }

  // Format Renewal Text
  const getRenewalText = () => {
    if (!promo?.buyer_discounts?.start_date) return ''
    const date = new Date(promo.buyer_discounts.start_date)
    if (promo.buyer_discounts.frequency === 'monthly') {
      const day = date.getDate()
      const s = ["th", "st", "nd", "rd"]
      const v = day % 100
      const suffix = s[(v - 20) % 10] || s[v] || s[0]
      return `Discounts renewed on the ${day}${suffix} of every month`
    }
    if (promo.buyer_discounts.frequency === 'weekly') {
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
      return `Discounts renewed every ${dayName}`
    }
    return `First cycle begins ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  const supabase = createClient()

  // Check if user is a pro_tester (sees all tiers regardless of flags)
  useEffect(() => {
    if (ENABLE_ELITE) return
    const checkTester = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email) {
        const { data } = await supabase
          .from('pro_testers')
          .select('email')
          .eq('email', session.user.email)
          .maybeSingle()
        if (data) setIsProTester(true)
      }
    }
    checkTester()
  }, [])

  const eliteVisible = ENABLE_ELITE || isProTester
  const visibleTierKeys = eliteVisible ? ['lite', 'pro', 'elite'] : ['lite', 'pro']

  const loadUserBooths = async (userId: string) => {
    try {
      const { data: booths } = await supabase
        .from('market_booths')
        .select('id, name, is_default, is_open, marked_for_archival')
        .eq('owner_id', userId)
        .neq('status', 'archived')
      
      if (booths) {
        setUserBooths(booths)
        const limit = selectedPlan === 'lite' ? 1 : selectedPlan === 'pro' ? 3 : 100
        const defaultBooth = booths.find((b: any) => b.is_default) || booths[0]
        const otherBooths = booths.filter((b: any) => b.id !== defaultBooth?.id)
        const selected = [defaultBooth?.id].filter(Boolean)
        
        while (selected.length < Math.min(limit, booths.length) && otherBooths.length > 0) {
          const next = otherBooths.shift()
          if (next) selected.push(next.id)
        }
        setSelectedBoothsToKeep(selected)
      }
    } catch (err) {
      console.error('Failed to load user booths:', err)
    }
  }

  const saveBoothArchivalStatuses = async (userId: string) => {
    const limit = selectedPlan === 'lite' ? 1 : selectedPlan === 'pro' ? 3 : 100
    if (userBooths.length <= limit) return

    const boothsToKeep = selectedBoothsToKeep
    const boothsToArchive = userBooths.filter(b => !boothsToKeep.includes(b.id)).map(b => b.id)

    if (boothsToKeep.length > 0) {
      await supabase
        .from('market_booths')
        .update({ marked_for_archival: false, updated_at: new Date().toISOString() })
        .in('id', boothsToKeep)
    }
    if (boothsToArchive.length > 0) {
      await supabase
        .from('market_booths')
        .update({ marked_for_archival: true, updated_at: new Date().toISOString() })
        .in('id', boothsToArchive)
    }
  }

  // Dynamic stand selection updater when the user toggles plans mid-onboarding
  useEffect(() => {
    if (userBooths.length > 0) {
      const limit = selectedPlan === 'lite' ? 1 : selectedPlan === 'pro' ? 3 : 100
      const defaultBooth = userBooths.find(b => b.is_default) || userBooths[0]
      const otherBooths = userBooths.filter(b => b.id !== defaultBooth?.id)
      const selected = [defaultBooth?.id].filter(Boolean)
      
      while (selected.length < Math.min(limit, userBooths.length) && otherBooths.length > 0) {
        const next = otherBooths.shift()
        if (next) selected.push(next.id)
      }
      setSelectedBoothsToKeep(selected)
    }
  }, [selectedPlan, userBooths])

  // Prefill logged-in user session or URL parameters on mount
  useEffect(() => {
    let isCurrent = true
    
    // 1. Check URL parameters first
    const emailParam = searchParams.get('email')
    if (emailParam && isCurrent) {
      setEmail(emailParam)
    }

    async function prefillSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user && isCurrent) {
          if (!emailParam) {
            setEmail(session.user.email || '')
          }
          setName(session.user.user_metadata?.full_name || '')
          setPhone(session.user.user_metadata?.phone || '')
          
          await loadUserBooths(session.user.id)
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()

          if (profile && isCurrent) {
            setName(profile.full_name || session.user.user_metadata?.full_name || '')
            setPhone(profile.phone || session.user.user_metadata?.phone || '')
            if (profile.street_address) {
              const parts = profile.street_address.split(',')
              if (parts.length >= 3) {
                setStreet(parts[0].trim())
                setCity(parts[1].trim())
                const stateZip = parts[2].trim().split(' ')
                if (stateZip.length >= 2) {
                  setState(stateZip[0].trim())
                  setZip(stateZip[1].trim())
                }
              }
            }
            if (profile.farm_name) {
              setFarmName(profile.farm_name)
            }
          }
        }
      } catch (err) {
        console.error('Session pre-fill failed:', err)
      }
    }
    prefillSession()
    return () => { isCurrent = false }
  }, [supabase, searchParams])


  useEffect(() => {
    setIsMounted(true)
    let isCurrent = true
    async function fetchData() {
      try {
        // Load pricing tiers
        const { data: dbTiers } = await supabase
          .from('subscription_tiers')
          .select('*')
          .order('subscription_price', { ascending: true })
        if (dbTiers && dbTiers.length > 0 && isCurrent) {
          setTiers(dbTiers as PlanTier[])
        }

        // Load PromotionDetails
        const { data: promoData, error: rpcErr } = await supabase
          .rpc('crm_get_landing_page_promotion', { p_slug: slug, p_promo_id: promo_id || null })
        
        if (rpcErr || !promoData) throw new Error('Promotion not found or no longer active.')

        if (isCurrent) {
          setPromo({
            id: promoData.id,
            name: promoData.name,
            description_html: promoData.description_html,
            enrollment_deadline: promoData.enrollment_deadline,
            allow_existing_users: promoData.allow_existing_users,
            is_capacity_reached: promoData.is_capacity_reached,
            giveaway: promoData.giveaway || undefined,
            buyer_discounts: promoData.buyer_discounts || undefined,
            sub_discount: promoData.sub_discount || undefined,
            hero_image_url: promoData.hero_image_url || null
          })

          // Load dynamic overrides/discounts for the promotion
          const { data: dbDiscounts } = await supabase
            .from('crm_promo_subscription_discounts')
            .select('*')
            .eq('promotion_id', promoData.id)

          if (dbDiscounts) {
            setPromoDiscounts(dbDiscounts)
          }
        }
      } catch (err: any) {
        if (isCurrent) setErrorMsg(err.message || 'Failed to load promotion.')
      } finally {
        if (isCurrent) setLoading(false)
      }
    }
    fetchData()
    return () => { isCurrent = false }
  }, [slug, promo_id])

  // Handle Stripe callback redirect and restore state
  useEffect(() => {
    if (!isMounted) return
    
    const proParam = searchParams.get('pro')
    const sessionIdParam = searchParams.get('session_id')
    
    if (proParam === 'success' && sessionIdParam) {
      const savedStr = localStorage.getItem('casagrown_promo_onboarding')
      if (savedStr) {
        try {
          const saved = JSON.parse(savedStr)
          setEmail(saved.email || '')
          setName(saved.name || '')
          setStreet(saved.street || '')
          setCity(saved.city || '')
          setState(saved.state || '')
          setZip(saved.zip || '')
          setPhone(saved.phone || '')
          setFarmName(saved.farmName || '')
          setSmsConsent(saved.smsConsent ?? true)
          setSelectedPlan(saved.selectedPlan || 'pro')
          setTosAccepted(true)
          
          setCheckoutSessionId(sessionIdParam)
          setStep('otp')
          
          localStorage.removeItem('casagrown_promo_onboarding')
          
          const triggerOtp = async () => {
            setSubmitting(true)
            setErrorMsg('')
            try {
              const fullAddress = `${saved.street}, ${saved.city}, ${saved.state} ${saved.zip}`
              const { error: otpErr } = await supabase.auth.signInWithOtp({
                email: saved.email,
                options: {
                  data: { 
                    full_name: saved.name, 
                    street_address: saved.street, 
                    city: saved.city,
                    state_code: saved.state,
                    zip_code: saved.zip,
                    phone: saved.phone, 
                    sms_consent: saved.smsConsent ?? true, 
                    tos_accepted: true,
                    farm_name: saved.farmName
                  }
                }
              })
              if (otpErr) throw otpErr
            } catch (err: any) {
              setErrorMsg(err.message || 'Payment accepted but failed to send login verification code.')
            } finally {
              setSubmitting(false)
            }
          }
          triggerOtp()
        } catch (e) {
          console.error('Failed to restore onboarding state:', e)
        }
      }
    }
  }, [isMounted, searchParams])

  const getTierDiscountDetails = (tierName: 'lite' | 'pro' | 'elite') => {
    const tier = tiers.find(t => t.tier_name === tierName)
    if (!tier) return null
    const regularPrice = tier.subscription_price
    
    // Find discount in promo discounts
    const discountRow = promoDiscounts.find(d => d.plan === tierName)
    let discountPct = 0
    let finalPrice = regularPrice
    let platformFee = tier.platform_fee_pct
    let feeReduction = 0
    
    if (discountRow) {
      discountPct = discountRow.discount_pct || 0
      finalPrice = regularPrice * (1 - discountPct / 100)
      feeReduction = discountRow.platform_fee_reduction_pct || 0
      platformFee = Math.max(0, platformFee - feeReduction)
    }
    
    return {
      regularPrice,
      finalPrice,
      discountPct,
      hasDiscount: discountPct > 0,
      savings: regularPrice - finalPrice,
      platformFee,
      feeReduction,
      stripeFeeHandling: discountRow?.stripe_fee_handling_override || 'keep_tier'
    }
  }

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase.rpc('crm_check_promo_eligibility', { p_promo_id: promo?.id, p_email: email })
      if (error) throw error
      
      if (!data.eligible) {
        setFallbackMode({ message: data.error })
        setSubmitting(false)
        return
      }

      if (data.is_registered) {
        setIsExistingUser(true)
      } else {
        setIsExistingUser(false)
      }
      setStep('profile')
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase()
      if (msg.includes('database error saving new user') || msg.includes('not available for registration')) {
        setErrorMsg('This email address has been permanently closed and cannot be used to create a new account.')
      } else {
        setErrorMsg(err.message || 'Something went wrong.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !street || !city || !state || !zip || !phone || !tosAccepted) return
    
    if (selectedPlan !== 'lite' && !farmName.trim()) {
      setErrorMsg('Business/Farm Name is required for Pro and Elite tiers.')
      return
    }

    if (!/^\d{5}$/.test(zip.trim())) {
      setErrorMsg('This promotion is currently only available for US residents. Please enter a valid 5-digit US ZIP Code.')
      return
    }

    setSubmitting(true)
    setErrorMsg('')

    // Asynchronous lead check & upsert to capture drop-off protection
    const upsertLeadBackup = async () => {
      try {
        const emailLower = email.trim().toLowerCase()
        const params = new URLSearchParams(window.location.search)
        
        // 1. Check if user is already logged in with complete profile details
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user && session.user.email?.toLowerCase() === emailLower) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()
          
          if (profile) {
            const hasName = !!profile.full_name?.trim()
            const hasPhone = !!profile.phone?.trim() || !!profile.phone_number?.trim()
            const hasAddress = !!profile.street_address?.trim()
            const hasFarm = selectedPlan === 'lite' || !!profile.farm_name?.trim()
            
            // If the registered user profile is already fully complete, skip capturing lead!
            if (hasName && hasPhone && hasAddress && hasFarm) {
              return
            }
          }
        }

        // 2. Query crm_leads for any existing lead with this email
        const { data: existingLeads } = await supabase
          .from('crm_leads')
          .select('*')
          .eq('email', email.trim())
          .order('created_at', { ascending: false })
          .limit(1)

        const existingLead = existingLeads && existingLeads.length > 0 ? existingLeads[0] : null

        const leadPayload = {
          name: name,
          email: email.trim(),
          phone: phone,
          source_platform: params.get('utm_source') || 'direct',
          source_url: window.location.href,
          utm_campaign: params.get('utm_campaign') || null,
          utm_content: params.get('utm_content') || null,
          utm_medium: params.get('utm_medium') || null,
          form_version: 'v2-marketing-slug-funnel',
          accepts_email: true,
          accepts_sms: smsConsent,
          metadata: {
            intent: 'seller',
            selected_plan: selectedPlan,
            promo_id: promo?.id || null,
            campaign_id: campaign_id || null,
            address: { street, city, state, zip },
            farm_name: farmName || null
          }
        }

        if (existingLead) {
          // Check if all fields are already captured and identical
          const extName = existingLead.name || ''
          const extPhone = existingLead.phone || ''
          const extAddr = existingLead.metadata?.address || {}
          const extFarm = existingLead.metadata?.farm_name || ''
          const extPlan = existingLead.metadata?.selected_plan || ''

          const isNameEqual = extName.trim() === name.trim()
          const isPhoneEqual = extPhone.trim() === phone.trim()
          const isAddrEqual = extAddr.street === street && extAddr.city === city && extAddr.state === state && extAddr.zip === zip
          const isFarmEqual = (selectedPlan === 'lite') || (extFarm.trim() === farmName.trim())
          const isPlanEqual = extPlan === selectedPlan

          // Skip if lead is already fully populated with the exact same data
          if (isNameEqual && isPhoneEqual && isAddrEqual && isFarmEqual && isPlanEqual) {
            return
          }

          // Otherwise, update (upsert) the existing lead record with the new complete details
          await supabase
            .from('crm_leads')
            .update(leadPayload)
            .eq('id', existingLead.id)
        } else {
          // No lead exists yet — insert a new one
          await supabase
            .from('crm_leads')
            .insert(leadPayload)
        }
      } catch (err) {
        console.error('Lead upsert failed:', err)
      }
    }
    upsertLeadBackup()

    try {
      // Check if user is already logged in as the correct user
      const { data: { session } } = await supabase.auth.getSession()
      const isLoggedIn = !!session?.user
      const loggedInEmail = session?.user?.email
      const isCorrectUser = isLoggedIn && loggedInEmail && loggedInEmail.toLowerCase() === email.toLowerCase()

      if (isCorrectUser) {
        await saveBoothArchivalStatuses(session.user.id)

        // Query active promotion discount (exclude expired ones)
        const { data: discData } = await supabase
          .from('user_subscription_discounts')
          .select('*, crm_promotions(id, name)')
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
          .limit(1)

        const existingDiscount = discData && discData.length > 0 ? discData[0] : null

        // If they have an active discount from a different promotion, intercept and transition to promo choice step!
        if (existingDiscount && existingDiscount.promotion_id !== promo?.id) {
          setActivePromoDiscount(existingDiscount)
          setStep('promo_choice')
          setSubmitting(false)
          return
        }

        // Fetch active subscription & Stripe customer status
        const { data: subData } = await supabase
          .from('seller_subscriptions')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle()

        const hasCardOnFile = subData && subData.stripe_customer_id && ['active', 'trialing'].includes(subData.status)

        if (selectedPlan === 'lite') {
          if (!skipPromo && promo) {
            await supabase.rpc('crm_enroll_in_promotion', { 
              p_promotion_id: promo.id,
              p_campaign_id: campaign_id || null
            })
          }

          if (subData?.stripe_subscription_id && ['active', 'trialing'].includes(subData.status)) {
            try {
              await supabase.functions.invoke('manage-subscription', {
                body: { action: 'cancel' },
              })
            } catch (err) {
              console.error('Failed to cancel active subscription in Stripe:', err)
            }
          }

          await supabase
            .from('seller_subscriptions')
            .update({ plan: 'lite', status: 'inactive', updated_at: new Date().toISOString() })
            .eq('user_id', session.user.id)

          const fullAddress = `${street}, ${city}, ${state} ${zip}`
          await supabase
            .from('profiles')
            .update({
              full_name: name,
              street_address: street,
              city: city,
              state_code: state,
              zip_code: zip,
              phone,
              sms_consent: smsConsent,
              farm_name: null,
              is_pro: false
            })
            .eq('id', session.user.id)

          setSuccessMessage("🎉 Welcome to CasaGrown Lite! Your account is set up with your current promotion.")
          setStep('lite_intent')
        } 
        else if (hasCardOnFile && subData?.plan === selectedPlan) {
          if (!skipPromo && promo) {
            await supabase.rpc('crm_enroll_in_promotion', { 
              p_promotion_id: promo.id,
              p_campaign_id: campaign_id || null
            })
          }

          await supabase
            .from('seller_subscriptions')
            .update({ plan: selectedPlan, status: 'active', updated_at: new Date().toISOString() })
            .eq('user_id', session.user.id)

          const fullAddress = `${street}, ${city}, ${state} ${zip}`
          await supabase
            .from('profiles')
            .update({
              full_name: name,
              street_address: street,
              city: city,
              state_code: state,
              zip_code: zip,
              phone,
              sms_consent: smsConsent,
              farm_name: farmName,
              is_pro: true
            })
            .eq('id', session.user.id)

          setSuccessMessage("🎉 Welcome back! Your subscription has been updated.")
          setBoothName(farmName || '')
          setBoothAddress(street || '')
          setBoothCity(city || '')
          setBoothState(state || '')
          setBoothZip(zip || '')
          setStep('booth_setup')
        }
        else {
          const stateToSave = {
            email,
            name,
            street,
            city,
            state,
            zip,
            phone,
            farmName,
            smsConsent,
            selectedPlan
          }
          localStorage.setItem('casagrown_promo_onboarding', JSON.stringify(stateToSave))
          setStep('payment')
          setShowCheckout(true)
        }
      } else {
        // Guest user or logged in as a different user -> trigger OTP verification
        // 1. Lite tier skips checkout entirely and triggers OTP
        if (selectedPlan === 'lite') {
          const fullAddress = `${street}, ${city}, ${state} ${zip}`
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
              data: { full_name: name, street_address: street, city: city, state_code: state, zip_code: zip, phone, sms_consent: smsConsent, tos_accepted: true }
            }
          })
          if (error) throw error
          setStep('otp')
        } 
        // 2. Paid tiers check if user is already registered (existing cardholders skip checkout)
        else if (isExistingUser) {
          const fullAddress = `${street}, ${city}, ${state} ${zip}`
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
              data: { full_name: name, street_address: street, city: city, state_code: state, zip_code: zip, phone, sms_consent: smsConsent, tos_accepted: true, farm_name: farmName }
            }
          })
          if (error) throw error
          setStep('otp')
        }
        // 3. New paid subscribers save state and mount StripeEmbeddedCheckout
        else {
          const stateToSave = {
            email,
            name,
            street,
            city,
            state,
            zip,
            phone,
            farmName,
            smsConsent,
            selectedPlan
          }
          localStorage.setItem('casagrown_promo_onboarding', JSON.stringify(stateToSave))
          setStep('payment')
          setShowCheckout(true)
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit profile. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePaymentComplete = async (sessionId: string) => {
    setCheckoutSessionId(sessionId)
    setShowCheckout(false)
    setSubmitting(true)
    setErrorMsg('')
    try {
      const fullAddress = `${street}, ${city}, ${state} ${zip}`
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: { 
            full_name: name, 
            street_address: street, 
            city: city,
            state_code: state,
            zip_code: zip,
            phone, 
            sms_consent: smsConsent, 
            tos_accepted: true,
            farm_name: farmName
          }
        }
      })
      if (otpErr) throw otpErr
      setStep('otp')
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment accepted but failed to trigger secure OTP code.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePaymentCompleteAfterLogin = async (sessionId: string) => {
    setCheckoutSessionId(sessionId)
    setShowCheckout(false)
    setSubmitting(true)
    setErrorMsg('')

    try {
      // Confirm checkout
      await supabase.functions.invoke('manage-subscription', {
        body: { action: 'confirm', session_id: sessionId },
      })

      if (promo) {
        await supabase.rpc('crm_enroll_in_promotion', { 
          p_promotion_id: promo.id,
          p_campaign_id: campaign_id || null
        })
      }

      const fullAddress = `${street}, ${city}, ${state} ${zip}`
      await supabase
        .from('profiles')
        .update({
          full_name: name,
          street_address: street,
          city: city,
          state_code: state,
          zip_code: zip,
          phone,
          sms_consent: smsConsent,
          farm_name: farmName,
          is_pro: true
        })
        .eq('id', (await supabase.auth.getUser()).data.user?.id || '')

      setSuccessMessage("🎉 Payment Successful! Your new plan has been activated.")
      setBoothName(farmName || '')
      setBoothAddress(street || '')
      setBoothCity(city || '')
      setBoothState(state || '')
      setBoothZip(zip || '')
      setStep('booth_setup')
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment completed but failed to update details.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeepPromo = async () => {
    setSubmitting(true)
    setErrorMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not found. Please log in again.')

      // Fetch card on file status
      const { data: subData } = await supabase
        .from('seller_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      const hasCardOnFile = subData && subData.stripe_customer_id && ['active', 'trialing'].includes(subData.status)

      if (selectedPlan === 'lite') {
        if (subData?.stripe_subscription_id && ['active', 'trialing'].includes(subData.status)) {
          try {
            await supabase.functions.invoke('manage-subscription', {
              body: { action: 'cancel' },
            })
          } catch (err) {
            console.error('Failed to cancel active subscription in Stripe:', err)
          }
        }

        await supabase
          .from('seller_subscriptions')
          .update({ plan: 'lite', status: 'inactive', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)

        await supabase
          .from('profiles')
          .update({ farm_name: null, is_pro: false })
          .eq('id', user.id)

        setSuccessMessage("🎉 Welcome to CasaGrown Lite! Your account is set up with your current promotion.")
        setStep('lite_intent')
      } 
      else if (hasCardOnFile && subData?.plan === selectedPlan) {
        await supabase
          .from('seller_subscriptions')
          .update({ plan: selectedPlan, status: 'active', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)

        await supabase
          .from('profiles')
          .update({ farm_name: farmName, is_pro: true })
          .eq('id', user.id)

        setSuccessMessage("🎉 Welcome back! Your subscription has been updated with your current promotion rate.")
        setBoothName(farmName || '')
        setBoothAddress(street || '')
        setBoothCity(city || '')
        setBoothState(state || '')
        setBoothZip(zip || '')
        setStep('booth_setup')
      }
      else {
        if (checkoutSessionId) {
          await supabase.functions.invoke('manage-subscription', {
            body: { action: 'confirm', session_id: checkoutSessionId },
          })
          await supabase
            .from('profiles')
            .update({ farm_name: farmName, is_pro: true })
            .eq('id', user.id)

          setSuccessMessage("🎉 Payment Successful! Your new plan has been activated with your current promotion rate.")
          setBoothName(farmName || '')
          setBoothAddress(street || '')
          setBoothCity(city || '')
          setBoothState(state || '')
          setBoothZip(zip || '')
          setStep('booth_setup')
        } else {
          setStep('payment')
          setShowCheckout(true)
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to complete signup with current promotion.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSwitchPromo = async () => {
    setSubmitting(true)
    setErrorMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not found. Please log in again.')

      // Switch from old promotion to the new one via a single RPC call
      if (promo) {
        const { error: switchErr } = await supabase.rpc('crm_switch_promotion', { 
          p_new_promotion_id: promo.id,
          p_campaign_id: campaign_id || null
        })
        if (switchErr) throw switchErr
      }

      // Fetch card on file status
      const { data: subData } = await supabase
        .from('seller_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      const hasCardOnFile = subData && subData.stripe_customer_id && ['active', 'trialing'].includes(subData.status)

      if (selectedPlan === 'lite') {
        if (subData?.stripe_subscription_id && ['active', 'trialing'].includes(subData.status)) {
          try {
            await supabase.functions.invoke('manage-subscription', {
              body: { action: 'cancel' },
            })
          } catch (err) {
            console.error('Failed to cancel active subscription in Stripe:', err)
          }
        }

        await supabase
          .from('seller_subscriptions')
          .update({ plan: 'lite', status: 'inactive', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)

        await supabase
          .from('profiles')
          .update({ farm_name: null, is_pro: false })
          .eq('id', user.id)

        setSuccessMessage("🎉 Welcome to CasaGrown Lite! Your account is set up with your new promotion.")
        setStep('lite_intent')
      } 
      else if (hasCardOnFile && subData?.plan === selectedPlan) {
        await supabase
          .from('seller_subscriptions')
          .update({ plan: selectedPlan, status: 'active', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)

        await supabase
          .from('profiles')
          .update({ farm_name: farmName, is_pro: true })
          .eq('id', user.id)

        setSuccessMessage("🎉 Welcome back! Your subscription has been updated with your new campaign discounts.")
        setBoothName(farmName || '')
        setBoothAddress(street || '')
        setBoothCity(city || '')
        setBoothState(state || '')
        setBoothZip(zip || '')
        setStep('booth_setup')
      }
      else {
        if (checkoutSessionId) {
          await supabase.functions.invoke('manage-subscription', {
            body: { action: 'confirm', session_id: checkoutSessionId },
          })
          await supabase
            .from('profiles')
            .update({ farm_name: farmName, is_pro: true })
            .eq('id', user.id)

          setSuccessMessage("🎉 Payment Successful! Your new plan has been activated with your new promotion rate.")
          setBoothName(farmName || '')
          setBoothAddress(street || '')
          setBoothCity(city || '')
          setBoothState(state || '')
          setBoothZip(zip || '')
          setStep('booth_setup')
        } else {
          setStep('payment')
          setShowCheckout(true)
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to switch to the new promotion.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otp) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      const { data: { session }, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
      if (verifyError) throw verifyError

      if (session?.user) {
        await loadUserBooths(session.user.id)
        await saveBoothArchivalStatuses(session.user.id)
      }

      // Query active promotion discount (exclude expired ones)
      const { data: discData } = await supabase
        .from('user_subscription_discounts')
        .select('*, crm_promotions(id, name)')
        .eq('user_id', session?.user?.id || '')
        .eq('status', 'active')
        .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
        .limit(1)

      const existingDiscount = discData && discData.length > 0 ? discData[0] : null

      // If they have an active discount from a different promotion, intercept and transition to promo choice step!
      if (existingDiscount && existingDiscount.promotion_id !== promo?.id) {
        setActivePromoDiscount(existingDiscount)
        setStep('promo_choice')
        setSubmitting(false)
        return
      }

      // Fetch active subscription & Stripe customer status
      const { data: subData } = await supabase
        .from('seller_subscriptions')
        .select('*')
        .eq('user_id', session?.user?.id || '')
        .maybeSingle()

      const hasCardOnFile = subData && subData.stripe_customer_id && ['active', 'trialing'].includes(subData.status)

      if (selectedPlan === 'lite') {
        if (!skipPromo && promo) {
          await supabase.rpc('crm_enroll_in_promotion', { 
            p_promotion_id: promo.id,
            p_campaign_id: campaign_id || null
          })
        }

        if (subData?.stripe_subscription_id && ['active', 'trialing'].includes(subData.status)) {
          try {
            await supabase.functions.invoke('manage-subscription', {
              body: { action: 'cancel' },
            })
          } catch (err) {
            console.error('Failed to cancel active subscription in Stripe:', err)
          }
        }

        await supabase
          .from('seller_subscriptions')
          .update({ plan: 'lite', status: 'inactive', updated_at: new Date().toISOString() })
          .eq('user_id', session?.user?.id || '')

        await supabase
          .from('profiles')
          .update({ farm_name: null, is_pro: false })
          .eq('id', session?.user?.id || '')

        setSuccessMessage("🎉 Welcome to CasaGrown Lite! Your account is set up.")
        setStep('lite_intent')
      } 
      else if (hasCardOnFile && subData?.plan === selectedPlan) {
        // Card detected - Skip card checkout completely! Apply dynamically
        if (!skipPromo && promo) {
          await supabase.rpc('crm_enroll_in_promotion', { 
            p_promotion_id: promo.id,
            p_campaign_id: campaign_id || null
          })
        }

        await supabase
          .from('seller_subscriptions')
          .update({ plan: selectedPlan, status: 'active', updated_at: new Date().toISOString() })
          .eq('user_id', session?.user?.id || '')

        await supabase
          .from('profiles')
          .update({ farm_name: farmName, is_pro: true })
          .eq('id', session?.user?.id || '')

        setSuccessMessage("🎉 Welcome back! Your subscription has been updated.")
        setBoothName(farmName || '')
        setBoothAddress(street || '')
        setBoothCity(city || '')
        setBoothState(state || '')
        setBoothZip(zip || '')
        setStep('booth_setup')
      }
      else {
        // Paid tier, no card on file
        if (checkoutSessionId) {
          // Already checked out before verification (Standard Signup flow)
          await supabase.functions.invoke('manage-subscription', {
            body: { action: 'confirm', session_id: checkoutSessionId },
          })
          if (!skipPromo && promo) {
            await supabase.rpc('crm_enroll_in_promotion', { 
              p_promotion_id: promo.id,
              p_campaign_id: campaign_id || null
            })
          }
          await supabase
            .from('profiles')
            .update({ farm_name: farmName, is_pro: true })
            .eq('id', session?.user?.id || '')

          setSuccessMessage("🎉 Payment Successful! Your plan has been activated with your promotional discounts.")
          setBoothName(farmName || '')
          setBoothAddress(street || '')
          setBoothCity(city || '')
          setBoothState(state || '')
          setBoothZip(zip || '')
          setStep('booth_setup')
        } else {
          // Verification complete but card checkout required (Registered user without card)
          setStep('payment')
          setShowCheckout(true)
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid code. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="promo-loading"><div className="spinner"></div>Loading Promotion...</div>
  if (!promo) return <div className="promo-error-page">{errorMsg || 'Promotion not found.'}</div>

  const isDeadlinePassed = new Date() > new Date(promo.enrollment_deadline)
  const bgImage = promo.hero_image_url || getBackgroundImage()

  const incentivesContent = (
    <div className="promo-incentive-grid">
      {promo.giveaway && (
        <div className="incentive-item giveaway-item">
          {promo.giveaway.photos && promo.giveaway.photos.length > 0 ? (
            <img src={promo.giveaway.photos[0]} alt={promo.giveaway.title || 'Giveaway'} className="incentive-photo" />
          ) : (
            <span className="incentive-icon">🎁</span>
          )}
          <div className="incentive-text">
            <strong>{promo.giveaway.title || 'Exclusive Giveaway'}</strong>
            {promo.giveaway.description ? (
              <div className="giveaway-html" dangerouslySetInnerHTML={{ __html: promo.giveaway.description.replace(/&nbsp;/g, ' ') }} />
            ) : (
              <p>Enter for a chance to win our prize bundle.</p>
            )}
          </div>
        </div>
      )}
      {promo.buyer_discounts && (
        <div className="incentive-item credits-item">
          {promo.buyer_discounts.image_url ? (
            <img src={promo.buyer_discounts.image_url} alt="Discount Bonus" className="incentive-photo" />
          ) : (
            <span className="incentive-icon">💰</span>
          )}
          <div className="incentive-text">
            <strong>${promo.buyer_discounts.discount_amount_usd} Shopping Discount</strong>
            <p>Issued {promo.buyer_discounts.frequency === 'monthly' ? 'once a month' : `every ${promo.buyer_discounts.frequency}`} for {promo.buyer_discounts.occurrences} {promo.buyer_discounts.occurrences === 1 ? 'month' : 'months'}.</p>
            <ul className="credit-rules">
              {getRenewalText() && <li>✓ {getRenewalText()}</li>}
              <li>✓ Valid towards purchases and fees on casagrown.com</li>
              <li>✓ Covers up to {promo.buyer_discounts.discount_cap_type === 'percentage' ? `${promo.buyer_discounts.discount_cap_value}%` : `$${promo.buyer_discounts.discount_cap_value}`} per order</li>
              <li>✓ Discounts expire after 1 {promo.buyer_discounts.frequency === 'monthly' ? 'month' : promo.buyer_discounts.frequency === 'weekly' ? 'week' : promo.buyer_discounts.frequency.replace('ly', '')}</li>
            </ul>
          </div>
        </div>
      )}
      {(() => {
        const details = getTierDiscountDetails(selectedPlan)
        if (!details || !details.hasDiscount) return null
        return (
          <div className="incentive-item" style={{ borderLeft: '4px solid #a855f7' }}>
            <span className="incentive-icon">⭐</span>
            <div className="incentive-text">
              <strong>{selectedPlan === 'pro' ? 'CasaGrown Pro' : 'CasaGrown Elite'} — {details.discountPct}% Off</strong>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#7e22ce', margin: '8px 0' }}>
                ${details.finalPrice.toFixed(2)}/mo <span style={{ fontSize: '0.9rem', fontWeight: 400, color: '#9ca3af', textDecoration: 'line-through' }}>${details.regularPrice.toFixed(2)}/mo</span>
              </p>
              <ul className="credit-rules">
                <li>✓ Save ${details.savings.toFixed(2)} every month on your membership</li>
                <li>✓ Lock in this exclusive promotional rate!</li>
                <li>✓ Platform Fee: {details.platformFee}% (Reduced by {details.feeReduction}%)</li>
              </ul>
            </div>
          </div>
        )
      })()}
    </div>
  )

  return (
    <>
      <div className="promo-bg-layer" style={{ backgroundImage: `url(${bgImage})` }}>
        <div className="promo-bg-overlay"></div>
      </div>

      <div className="promo-content-wrapper">
        <div className="promo-main-glass">
          <div className="promo-hero-section">
            <h1 className="promo-headline">{promo.name}</h1>
            {promo.description_html && (
              <div className="promo-description" dangerouslySetInnerHTML={{ __html: promo.description_html.replace(/&nbsp;/g, ' ') }} />
            )}

            {isMounted && isDeadlinePassed ? (
              <div className="promo-badge deadline-passed">Promotion Ended</div>
            ) : isMounted && promo.is_capacity_reached ? (
              <div className="promo-badge deadline-passed">Promotion Limit Reached</div>
            ) : isMounted ? (
              <div className="promo-badge active">
                Ends {new Date(promo.enrollment_deadline).toLocaleDateString()}
              </div>
            ) : (
              <div className="promo-badge active" style={{ opacity: 0 }}>Ends...</div>
            )}

            {/* Dynamic Step Tracker */}
            {['booth_setup', 'manage_features', 'first_listing', 'done'].includes(step) ? (
              <div className="progress-steps">
                <div className={`progress-step ${step === 'booth_setup' ? 'active' : ['manage_features', 'first_listing', 'done'].includes(step) ? 'completed' : ''}`}>
                  <span className="step-num">{['manage_features', 'first_listing', 'done'].includes(step) ? '✓' : '1'}</span>
                  <span className="step-label">Stand</span>
                </div>
                <div className={`progress-step ${step === 'manage_features' ? 'active' : ['first_listing', 'done'].includes(step) ? 'completed' : ''}`}>
                  <span className="step-num">{['first_listing', 'done'].includes(step) ? '✓' : '2'}</span>
                  <span className="step-label">Features</span>
                </div>
                <div className={`progress-step ${step === 'first_listing' ? 'active' : step === 'done' ? 'completed' : ''}`}>
                  <span className="step-num">{step === 'done' ? '✓' : '3'}</span>
                  <span className="step-label">First Listing</span>
                </div>
                <div className={`progress-step ${step === 'done' ? 'active' : ''}`}>
                  <span className="step-num">{step === 'done' ? '✓' : '4'}</span>
                  <span className="step-label">Done</span>
                </div>
              </div>
            ) : (
            <div className="progress-steps">
              <div className={`progress-step ${step !== 'initial' ? 'completed' : 'active'}`}>
                <span className="step-num">{step !== 'initial' ? '✓' : '1'}</span>
                <span className="step-label">Select Plan</span>
              </div>
              <div className={`progress-step ${step === 'profile' ? 'active' : ['otp', 'promo_choice', 'payment', 'success'].includes(step) ? 'completed' : ''}`}>
                <span className="step-num">{['otp', 'promo_choice', 'payment', 'success'].includes(step) ? '✓' : '2'}</span>
                <span className="step-label">Profile</span>
              </div>
              <div className={`progress-step ${['otp', 'promo_choice'].includes(step) ? 'active' : ['payment', 'success'].includes(step) ? 'completed' : ''}`}>
                <span className="step-num">{['payment', 'success'].includes(step) ? '✓' : '3'}</span>
                <span className="step-label">{step === 'promo_choice' ? 'Choose Offer' : 'Verify'}</span>
              </div>
              {selectedPlan !== 'lite' && (
                <div className={`progress-step ${step === 'payment' ? 'active' : step === 'success' ? 'completed' : ''}`}>
                  <span className="step-num">{step === 'success' ? '✓' : '4'}</span>
                  <span className="step-label">Checkout</span>
                </div>
              )}
            </div>
            )}

            <div className="desktop-incentives">
              {incentivesContent}
            </div>
          </div>

          <div className="promo-form-section">
            {step === 'success' ? (
              <div className="form-success-state">
                <div className="success-icon">🎉</div>
                <h2>You're Enrolled!</h2>
                <p className="success-banner-msg">{successMessage}</p>
                <div className="spinner" style={{ margin: '20px auto 0' }}></div>
              </div>
            ) : isMounted && isDeadlinePassed ? (
              <div className="form-error-state">
                We're sorry, but the deadline for this promotion has passed.
              </div>
            ) : isMounted && promo.is_capacity_reached ? (
              <div className="form-fallback-state fade-in-up" style={{ background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 16px 40px rgba(0,0,0,0.08)' }}>
                <div className="form-error-banner" style={{ marginBottom: '24px' }}>
                  We're sorry, but this promotion has reached its maximum capacity.
                </div>
                <h2 className="form-heading">You can still join CasaGrown!</h2>
                <p className="form-subheading">While you missed out on this specific offer, you can still sign up to access the market and receive future promotions.</p>
                <Link href="/market" className="btn-action" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  Continue to Market
                </Link>
              </div>
            ) : fallbackMode ? (
              <div className="form-fallback-state fade-in-up" style={{ background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 16px 40px rgba(0,0,0,0.08)' }}>
                <div className="form-error-banner" style={{ marginBottom: '24px' }}>
                  {fallbackMode.message}
                </div>
                <h2 className="form-heading">You can still join CasaGrown!</h2>
                <p className="form-subheading">While you aren't eligible for this specific offer, you can still sign up to access the market and receive future promotions.</p>
                <button onClick={() => { setSkipPromo(true); setFallbackMode(null); setStep('profile') }} className="btn-action" style={{ marginBottom: '16px' }}>
                  Continue Sign Up Without Promo
                </button>
                <Link href="/market" style={{ display: 'block', textAlign: 'center', color: '#166534', textDecoration: 'underline', fontWeight: 600 }}>
                  Or browse the market
                </Link>
              </div>
            ) : isMounted ? (
              <div className="dynamic-form">
                {errorMsg && <div className="form-error-banner">{errorMsg}</div>}
                
                {step === 'initial' && (
                  <form onSubmit={handleInitialSubmit} className="fade-in-up">
                    <h2 className="form-heading">Claim Your Offer</h2>
                    <p className="form-subheading" style={{ marginBottom: '24px' }}>Select your tier and enter your email below to get started.</p>
                    
                    {/* Selectable Pricing Tiers Grid */}
                    <div className="tier-cards-grid">
                      {visibleTierKeys.map((tierKey) => {
                        const tier = tiers.find(t => t.tier_name === tierKey) || DEFAULT_TIERS.find(t => t.tier_name === tierKey)!
                        const details = getTierDiscountDetails(tierKey as 'lite' | 'pro' | 'elite')!
                        const isSelected = selectedPlan === tierKey
                        
                        return (
                          <div 
                            key={tierKey} 
                            onClick={() => setSelectedPlan(tierKey as 'lite' | 'pro' | 'elite')}
                            className={`tier-card ${isSelected ? 'selected' : ''}`}
                          >
                            {details.hasDiscount && (
                              <div className="tier-discount-badge">{details.discountPct}% Off</div>
                            )}
                            <h3 className="tier-card-title">{tier.display_name}</h3>
                            <div className="tier-card-price">
                              {details.hasDiscount ? (
                                <>
                                  <span className="price-strike">${details.regularPrice.toFixed(2)}</span>
                                  <span className="price-active">${details.finalPrice.toFixed(2)}<span className="price-period">/mo</span></span>
                                </>
                              ) : (
                                <span className="price-active">${tier.subscription_price.toFixed(2)}{tier.subscription_price > 0 && <span className="price-period">/mo</span>}</span>
                              )}
                            </div>
                            <div className="tier-card-details">
                              <div style={{ marginBottom: '6px' }}>✓ platform fee: <strong>{details.platformFee}%</strong></div>
                              <div style={{ marginBottom: '8px' }}>✓ max booths: <strong>{tier.max_booths < 0 ? 'Unlimited' : tier.max_booths}</strong></div>
                              
                              {tierKey === 'lite' && (
                                <div className="tier-extra-feats" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', color: '#4b5563', borderTop: '1px dashed #e5e7eb', paddingTop: '8px', textAlign: 'left' }}>
                                  <div>✓ Standard Checkout</div>
                                  <div>✓ Basic Listing Tools</div>
                                </div>
                              )}

                              {tierKey === 'pro' && (
                                <div className="tier-extra-feats" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', color: '#047857', borderTop: '1px dashed #e5e7eb', paddingTop: '8px', textAlign: 'left' }}>
                                  <div style={{ fontWeight: 600 }}>✓ GrowBot AI Assistant</div>
                                  <div>✓ Facebook Catalog Sync</div>
                                  <div>✓ Facebook Auto-Posting</div>
                                  <div>✓ Facebook DM Auto-Replies</div>
                                  <div>✓ Facebook Comment Auto-Replies</div>
                                  <div>✓ 7-Day Guarantee Refund</div>
                                </div>
                              )}

                              {tierKey === 'elite' && (
                                <div className="tier-extra-feats" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', color: '#1e3a8a', borderTop: '1px dashed #e5e7eb', paddingTop: '8px', textAlign: 'left' }}>
                                  <div style={{ fontWeight: 600 }}>✓ Everything in Pro</div>
                                  <div>✓ Instagram Auto-Posting</div>
                                  <div>✓ Instagram DM Auto-Replies</div>
                                  <div>✓ Instagram Comment Auto-Replies</div>
                                  <div>✓ Video Auto-Posts (Insta & FB)</div>
                                  <div>✓ Post to Google Maps / Places</div>
                                  <div>✓ Custom premium branding</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="input-group">
                      <label>Email Address</label>
                      <input type="email" required value={email} onChange={e => setEmail(e.target.value)} onBlur={e => handleFieldBlur('email', e.target.value)} placeholder="hello@example.com" />
                    </div>
                    <button type="submit" disabled={submitting || !email} className="btn-action">
                      {submitting ? 'Checking eligibility...' : 'Continue to Claim'}
                    </button>
                  </form>
                )}

                {step === 'profile' && (
                  <form onSubmit={handleProfileSubmit} className="fade-in-up">
                    <h2 className="form-heading">Setup Your Profile</h2>
                    <p className="form-subheading">Create your profile to claim your promotion rewards.</p>
                    <div className="input-group">
                      <label>Country</label>
                      <input type="text" value="United States" disabled style={{ background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed', borderColor: '#d1d5db' }} />
                    </div>
                    
                    {/* Conditional Business/Farm Name Field */}
                    {selectedPlan !== 'lite' && (
                      <div className="input-group">
                        <label>Business / Farm Name</label>
                        <input 
                          type="text" 
                          required 
                          value={farmName} 
                          onChange={e => setFarmName(e.target.value)} 
                          onBlur={e => handleFieldBlur('farm_name', e.target.value)}
                          placeholder="e.g. Oakridge Farms" 
                        />
                      </div>
                    )}

                    <div className="input-group">
                      <label>Full Name</label>
                      <input type="text" required value={name} onChange={e => setName(e.target.value)} onBlur={e => handleFieldBlur('full_name', e.target.value)} placeholder="Jane Doe" />
                    </div>
                    <div className="input-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label>Street Address</label>
                        <button 
                          type="button" 
                          onClick={handleUseCurrentLocation} 
                          disabled={locating}
                          className="use-location-btn"
                        >
                          {locating ? '📍 Locating...' : '📍 Use Current Location'}
                        </button>
                      </div>
                      <input type="text" required value={street} onChange={e => setStreet(e.target.value)} onBlur={e => handleFieldBlur('street_address', e.target.value)} placeholder="123 Farm Road" />
                    </div>
                    <div className="input-row">
                      <div className="input-group" style={{ flex: 2 }}>
                        <label>City</label>
                        <input type="text" required value={city} onChange={e => setCity(e.target.value)} onBlur={e => handleFieldBlur('city', e.target.value)} placeholder="City" />
                      </div>
                      <div className="input-group" style={{ flex: '0 0 70px' }}>
                        <label>State</label>
                        <input type="text" required value={state} onChange={e => setState(e.target.value)} onBlur={e => handleFieldBlur('state_code', e.target.value)} placeholder="ST" maxLength={2} />
                      </div>
                      <div className="input-group" style={{ flex: '0 0 110px' }}>
                        <label>ZIP Code</label>
                        <input type="text" required value={zip} onChange={e => setZip(e.target.value)} onBlur={e => handleFieldBlur('zip_code', e.target.value)} placeholder="12345" maxLength={5} />
                      </div>
                    </div>
                    <div className="input-group">
                      <label>Phone Number</label>
                      <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} onBlur={e => handleFieldBlur('phone', e.target.value)} placeholder="(555) 555-5555" />
                    </div>
                    <label className="checkbox-wrap" style={{ marginBottom: '16px' }}>
                      <input type="checkbox" checked={smsConsent} onChange={e => {
                        setSmsConsent(e.target.checked);
                        trackFieldInteract(`/p/${slug}`, getStepIndex(step), 'sms_consent', e.target.checked);
                      }} />
                      <div className="checkbox-text">
                        <strong>Enable Order SMS Notifications</strong>
                        <div style={{ fontSize: '0.8rem', marginTop: '4px', color: '#6b7280', lineHeight: 1.4 }}>
                          By providing your phone number and checking this box, you consent to receive critical transactional SMS notifications (like order updates) from CasaGrown. Reply STOP to cancel. Msg & data rates may apply.
                        </div>
                      </div>
                    </label>
                    {/* Downgrade Booth Selector */}
                    {userBooths.length > (selectedPlan === 'lite' ? 1 : selectedPlan === 'pro' ? 3 : 100) && (
                      <div className="downgrade-booth-selector" style={{
                        marginTop: '24px',
                        marginBottom: '24px',
                        padding: '20px',
                        background: '#fef3c7',
                        border: '1px solid #fcd34d',
                        borderRadius: '16px',
                        textAlign: 'left'
                      }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          ⚠️ Downgrade Stand Selection
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: '#78350f', lineHeight: 1.5, marginBottom: '16px' }}>
                          Your new plan supports up to <strong>{selectedPlan === 'lite' ? 1 : 3}</strong> active stand{selectedPlan === 'pro' ? 's' : ''} next month. Please select which stand{selectedPlan === 'pro' ? 's' : ''} you want to keep. Your other stands will remain active for the rest of this month, and will be automatically archived when your new billing cycle starts next month.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {userBooths.map((booth) => {
                            const isDefault = booth.is_default || userBooths.filter(b => b.is_default).length === 0 && userBooths[0].id === booth.id
                            const isChecked = selectedBoothsToKeep.includes(booth.id) || isDefault
                            const limit = selectedPlan === 'lite' ? 1 : selectedPlan === 'pro' ? 3 : 100
                            const isDisableCheckbox = isDefault || (!isChecked && selectedBoothsToKeep.length >= limit)

                            return (
                              <label key={booth.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px 16px',
                                background: 'white',
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                cursor: isDefault ? 'not-allowed' : 'pointer',
                                opacity: isDisableCheckbox && !isChecked ? 0.6 : 1,
                              }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isDefault || isDisableCheckbox}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedBoothsToKeep([...selectedBoothsToKeep, booth.id])
                                    } else {
                                      setSelectedBoothsToKeep(selectedBoothsToKeep.filter(id => id !== booth.id))
                                    }
                                  }}
                                  style={{ width: '18px', height: '18px', cursor: isDefault ? 'not-allowed' : 'pointer' }}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: 600, color: '#1f2937' }}>{booth.name || 'Unnamed Stand'}</span>
                                  {isDefault && <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>Default Stand (Required)</span>}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                        <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#78350f', fontWeight: 600, textAlign: 'right' }}>
                          Selected: {selectedBoothsToKeep.length} of {selectedPlan === 'lite' ? 1 : 3}
                        </div>
                      </div>
                    )}

                    <label className="checkbox-wrap">
                      <input type="checkbox" required checked={tosAccepted} onChange={e => setTosAccepted(e.target.checked)} />
                      <span className="checkbox-text">
                        I agree to the <button type="button" className="link-button" onClick={(e) => { e.preventDefault(); setModalContent('tos') }}>Terms of Service</button> & <button type="button" className="link-button" onClick={(e) => { e.preventDefault(); setModalContent('privacy') }}>Privacy Policy</button>
                      </span>
                    </label>
                    <button type="submit" disabled={submitting || !name || !street || !city || !state || !zip || !phone || !tosAccepted || (userBooths.length > (selectedPlan === 'lite' ? 1 : selectedPlan === 'pro' ? 3 : 100) && selectedBoothsToKeep.length !== (selectedPlan === 'lite' ? 1 : selectedPlan === 'pro' ? 3 : 100))} className="btn-action">
                      {submitting ? 'Processing...' : (selectedPlan === 'lite' || isExistingUser) ? 'Send Login Code' : 'Proceed to Checkout'}
                    </button>
                  </form>
                )}

                {step === 'otp' && (
                  <form onSubmit={handleOtpSubmit} className="fade-in-up">
                    <h2 className="form-heading">Verify Your Email</h2>
                    <p className="form-subheading">We sent a secure code to <strong>{email}</strong>.</p>
                    <div className="input-group otp-group">
                      <label>Login Code</label>
                      <input type="text" required value={otp} onChange={e => setOtp(e.target.value)} placeholder="123456" maxLength={6} />
                    </div>
                    <button type="submit" disabled={submitting || !otp} className="btn-action">
                      {submitting ? 'Verifying...' : 'Verify & Claim Offer'}
                    </button>
                  </form>
                )}

                {step === 'promo_choice' && (
                  <div className="fade-in-up promo-choice-container">
                    <h2 className="form-heading">Choose Your Promotion</h2>
                    <p className="form-subheading">We found an active promotion on your account. Would you like to keep it or switch to this new deal?</p>
                    
                    <div className="promo-choice-cards">
                      {/* Current Promotion Card */}
                      <div className="choice-card current-promo-card">
                        <div className="choice-card-badge">Current Rate</div>
                        <h3 className="choice-title">{activePromoDiscount?.crm_promotions?.name || 'Your Active Promo'}</h3>
                        <div className="choice-discount-value">
                          {activePromoDiscount?.discount_pct ? `${activePromoDiscount.discount_pct}% Off` : 'Active discount'}
                        </div>
                        <p className="choice-description">
                          Keep your existing active rate and subscription benefits.
                        </p>
                        <button 
                          type="button" 
                          onClick={handleKeepPromo} 
                          disabled={submitting} 
                          className="choice-btn choice-btn-secondary"
                        >
                          {submitting ? 'Processing...' : 'Keep Current Promo'}
                        </button>
                      </div>

                      {/* New Promotion Card */}
                      <div className="choice-card new-promo-card">
                        <div className="choice-card-badge new-badge">New Offer</div>
                        <h3 className="choice-title">{promo.name}</h3>
                        <div className="choice-discount-value purple-text">
                          {promo.sub_discount?.discount_pct ? `${promo.sub_discount.discount_pct}% Off` : 'New discount'}
                        </div>
                        <p className="choice-description">
                          Switch to the new promotion rate and activate the new campaign benefits.
                        </p>
                        <button 
                          type="button" 
                          onClick={handleSwitchPromo} 
                          disabled={submitting} 
                          className="choice-btn choice-btn-primary"
                        >
                          {submitting ? 'Processing...' : 'Switch to New Promo'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {step === 'payment' && (
                  <div className="fade-in-up" style={{ textAlign: 'center', padding: '24px 0' }}>
                    <h2 className="form-heading">Secure Checkout</h2>
                    <p className="form-subheading">Please complete checkout to finalize your subscription upgrade.</p>
                    <div className="checkout-loading-box">
                      <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
                      <p>Launching Stripe Embedded Checkout...</p>
                    </div>
                    <button 
                      onClick={() => setShowCheckout(true)} 
                      className="btn-action" 
                      style={{ marginTop: '20px' }}
                    >
                      Reopen Payment Window
                    </button>
                  </div>
                )}

                {step === 'booth_setup' && (
                  <div className="fade-in-up">
                    <h2 className="form-heading">🏪 Set Up Your Stand — Step 1 of 3</h2>
                    <p className="form-subheading" style={{ marginBottom: '8px' }}>
                      Your stand is where customers find you. Set your name, location, and when you're available — so neighbors can start buying from you right away.
                    </p>
                    <p style={{ fontSize: '0.85rem', color: '#16a34a', fontWeight: 600, marginBottom: '20px' }}>
                      ➡️ Next: Set up your Pro features so listings post automatically.
                    </p>

                    {successMessage && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.9rem', color: '#15803d', fontWeight: 600 }}>
                        {successMessage}
                      </div>
                    )}

                    <div className="input-group">
                      <label>Stand Name</label>
                      <input type="text" value={boothName} onChange={e => setBoothName(e.target.value)} placeholder="e.g. Oakridge Farm Stand" />
                    </div>
                    <div className="input-group">
                      <label>Street Address</label>
                      <input type="text" value={boothAddress} onChange={e => setBoothAddress(e.target.value)} placeholder="123 Farm Road" />
                    </div>
                    <div className="input-row">
                      <div className="input-group" style={{ flex: 2 }}>
                        <label>City</label>
                        <input type="text" value={boothCity} onChange={e => setBoothCity(e.target.value)} placeholder="City" />
                      </div>
                      <div className="input-group" style={{ flex: '0 0 70px' }}>
                        <label>State</label>
                        <input type="text" value={boothState} onChange={e => setBoothState(e.target.value)} placeholder="ST" maxLength={2} />
                      </div>
                      <div className="input-group" style={{ flex: '0 0 110px' }}>
                        <label>ZIP</label>
                        <input type="text" value={boothZip} onChange={e => setBoothZip(e.target.value)} placeholder="12345" maxLength={5} />
                      </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '8px' }}>Fulfillment Options</label>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: boothPickup ? '#f0fdf4' : '#f9fafb', border: `2px solid ${boothPickup ? '#22c55e' : '#e5e7eb'}`, borderRadius: '12px', cursor: 'pointer', flex: 1, transition: 'all 0.2s' }}>
                          <input type="checkbox" checked={boothPickup} onChange={e => setBoothPickup(e.target.checked)} style={{ accentColor: '#22c55e' }} />
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>🏪 Pickup</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: boothDelivery ? '#f0fdf4' : '#f9fafb', border: `2px solid ${boothDelivery ? '#22c55e' : '#e5e7eb'}`, borderRadius: '12px', cursor: 'pointer', flex: 1, transition: 'all 0.2s' }}>
                          <input type="checkbox" checked={boothDelivery} onChange={e => setBoothDelivery(e.target.checked)} style={{ accentColor: '#22c55e' }} />
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>🚗 Delivery</span>
                        </label>
                      </div>
                    </div>

                    <div className="input-group">
                      <label>Available Hours</label>
                      <input type="text" value={boothTimeWindows} onChange={e => setBoothTimeWindows(e.target.value)} placeholder="e.g. 9:00 AM - 5:00 PM" />
                    </div>

                    {errorMsg && <div className="form-error-banner">{errorMsg}</div>}

                    <button
                      type="button"
                      disabled={boothSaving}
                      className="btn-action"
                      onClick={async () => {
                        setBoothSaving(true)
                        setErrorMsg('')
                        try {
                          const { data: { user } } = await supabase.auth.getUser()
                          if (!user) throw new Error('Not authenticated')
                          const { data: existingBooths } = await supabase
                            .from('market_booths')
                            .select('id, is_default')
                            .eq('owner_id', user.id)
                            .eq('is_default', true)
                            .limit(1)
                          const defaultBooth = existingBooths && existingBooths.length > 0 ? existingBooths[0] : null
                          const boothPayload = {
                            name: boothName || farmName || 'My Stand',
                            address: boothAddress ? `${boothAddress}, ${boothCity}, ${boothState} ${boothZip}` : `${street}, ${city}, ${state} ${zip}`,
                            fulfillment_pickup: boothPickup,
                            fulfillment_delivery: boothDelivery,
                            available_hours: boothTimeWindows,
                            updated_at: new Date().toISOString()
                          }
                          if (defaultBooth) {
                            await supabase.from('market_booths').update(boothPayload).eq('id', defaultBooth.id)
                          } else {
                            await supabase.from('market_booths').insert({ ...boothPayload, owner_id: user.id, is_default: true })
                          }
                          setOnboardingCompleted(prev => ({ ...prev, booth: true }))
                          setStep('manage_features')
                        } catch (err: any) {
                          setErrorMsg(err.message || 'Failed to save stand. Please try again.')
                        } finally {
                          setBoothSaving(false)
                        }
                      }}
                    >
                      {boothSaving ? 'Saving...' : 'Save & Continue →'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep('manage_features')}
                      style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginTop: '12px', textAlign: 'center', width: '100%', padding: '8px' }}
                    >
                      Skip for now
                    </button>
                    <p style={{ fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center', marginTop: '4px', lineHeight: 1.4 }}>
                      No worries! You can set this up anytime from the ☰ Menu → My Stands.
                    </p>
                  </div>
                )}

                {step === 'manage_features' && (
                  <div className="fade-in-up">
                    <h2 className="form-heading">⚡ Manage Your Features — Step 2 of 3</h2>
                    <p className="form-subheading" style={{ marginBottom: '8px' }}>
                      This is the power of {selectedPlan === 'elite' ? 'Elite' : 'Pro'} — connect once, and every listing you create automatically posts to your Facebook, Instagram, and Google Business Profile. No more copy-pasting!
                    </p>
                    <p style={{ fontSize: '0.85rem', color: '#16a34a', fontWeight: 600, marginBottom: '24px' }}>
                      ➡️ Next: Create your first listing and watch it go live everywhere.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>📘 Facebook Page & Catalog</h3>
                        <FacebookStatus />
                      </div>

                      <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>📸 Instagram Auto-Post</h3>
                        <InstagramSettings />
                      </div>

                      <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>📍 Google Business Profile</h3>
                        <GooglePlacesSettings />
                      </div>


                    </div>

                    <button
                      type="button"
                      className="btn-action"
                      style={{ marginTop: '24px' }}
                      onClick={() => {
                        setOnboardingCompleted(prev => ({ ...prev, features: true }))
                        setStep('first_listing')
                      }}
                    >
                      Continue →
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep('first_listing')}
                      style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginTop: '12px', textAlign: 'center', width: '100%', padding: '8px' }}
                    >
                      Skip for now
                    </button>
                    <p style={{ fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center', marginTop: '4px', lineHeight: 1.4 }}>
                      You can connect these anytime from the ☰ Menu → Manage Pro Features.
                    </p>
                  </div>
                )}

                {step === 'first_listing' && (
                  <div className="fade-in-up">
                    <h2 className="form-heading">📸 Your First Listing — Step 3 of 3</h2>
                    <p className="form-subheading" style={{ marginBottom: '8px' }}>
                      Let&apos;s put your first product on the market! Take a photo of something you&apos;re growing — GrowBot AI will write the description, suggest a price, and post it to all your connected channels.
                    </p>
                    <p style={{ fontSize: '0.85rem', color: '#16a34a', fontWeight: 600, marginBottom: '20px' }}>
                      ➡️ Almost done! Create your listing and you&apos;re all set.
                    </p>

                    {errorMsg && <div className="form-error-banner">{errorMsg}</div>}

                    <div style={{
                      border: '2px dashed #d1d5db',
                      borderRadius: '16px',
                      padding: '32px 20px',
                      textAlign: 'center',
                      marginBottom: '16px',
                      cursor: 'pointer',
                      background: listingPhotoPreview ? 'transparent' : '#f9fafb',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all 0.2s'
                    }}
                      onClick={() => document.getElementById('listing-photo-input')?.click()}
                    >
                      {listingPhotoPreview ? (
                        <img src={listingPhotoPreview} alt="Preview" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '12px' }} />
                      ) : (
                        <>
                          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📷</div>
                          <p style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 600 }}>Tap to add a photo</p>
                          <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Take a photo of your produce</p>
                        </>
                      )}
                      <input
                        id="listing-photo-input"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setListingPhoto(file)
                            setListingPhotoPreview(URL.createObjectURL(file))
                          }
                        }}
                      />
                    </div>

                    <div className="input-group">
                      <label>Product Name</label>
                      <input type="text" value={listingName} onChange={e => setListingName(e.target.value)} placeholder="e.g. Fresh Tomatoes" />
                    </div>
                    <div className="input-row">
                      <div className="input-group" style={{ flex: 1 }}>
                        <label>Price ($)</label>
                        <input type="number" step="0.01" min="0" value={listingPrice} onChange={e => setListingPrice(e.target.value)} placeholder="5.00" />
                      </div>
                      <div className="input-group" style={{ flex: 1 }}>
                        <label>Quantity</label>
                        <input type="number" min="1" value={listingQty} onChange={e => setListingQty(e.target.value)} placeholder="1" />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={listingSaving || !listingName}
                      className="btn-action"
                      onClick={async () => {
                        setListingSaving(true)
                        setErrorMsg('')
                        try {
                          const { data: { user } } = await supabase.auth.getUser()
                          if (!user) throw new Error('Not authenticated')

                          let photoUrl = ''
                          if (listingPhoto) {
                            const ext = listingPhoto.name.split('.').pop() || 'jpg'
                            const filePath = `${user.id}/${Date.now()}.${ext}`
                            const { error: uploadErr } = await supabase.storage
                              .from('listing-photos')
                              .upload(filePath, listingPhoto)
                            if (uploadErr) throw uploadErr
                            const { data: urlData } = supabase.storage.from('listing-photos').getPublicUrl(filePath)
                            photoUrl = urlData.publicUrl
                          }

                          const { data: booth } = await supabase
                            .from('market_booths')
                            .select('id')
                            .eq('owner_id', user.id)
                            .eq('is_default', true)
                            .limit(1)
                            .single()

                          await supabase.from('market_listings').insert({
                            booth_id: booth?.id,
                            seller_id: user.id,
                            title: listingName,
                            price: parseFloat(listingPrice) || 0,
                            quantity: parseInt(listingQty) || 1,
                            photo_url: photoUrl || null,
                            status: 'active'
                          })

                          setOnboardingCompleted(prev => ({ ...prev, listing: true }))
                          setStep('done')
                        } catch (err: any) {
                          setErrorMsg(err.message || 'Failed to create listing. Please try again.')
                        } finally {
                          setListingSaving(false)
                        }
                      }}
                    >
                      {listingSaving ? 'Creating...' : 'Create & Go →'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStep('done')
                      }}
                      style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginTop: '12px', textAlign: 'center', width: '100%', padding: '8px' }}
                    >
                      Skip for now
                    </button>
                    <p style={{ fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center', marginTop: '4px', lineHeight: 1.4 }}>
                      You can create listings anytime from the Market page or at casagrown.com → Create Listing.
                    </p>
                  </div>
                )}

                {step === 'done' && (
                  <div className="fade-in-up" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🎉</div>
                    <h2 className="form-heading" style={{ textAlign: 'center' }}>You&apos;re All Set!</h2>
                    <p className="form-subheading" style={{ textAlign: 'center', marginBottom: '24px' }}>
                      Your {selectedPlan === 'elite' ? 'Elite' : 'Pro'} account is ready. Here&apos;s a summary of your setup:
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left', marginBottom: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: onboardingCompleted.booth ? '#f0fdf4' : '#fefce8', borderRadius: '12px', border: `1px solid ${onboardingCompleted.booth ? '#bbf7d0' : '#fde68a'}` }}>
                        <span style={{ fontSize: '1.2rem' }}>{onboardingCompleted.booth ? '✅' : '⏭️'}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 700, color: '#1f2937', fontSize: '0.9rem' }}>Stand Setup</span>
                          {!onboardingCompleted.booth && (
                            <p style={{ fontSize: '0.78rem', color: '#92400e', margin: '2px 0 0' }}>
                              Set up later: ☰ Menu → <a href="/my-stands" style={{ color: '#166534', textDecoration: 'underline', fontWeight: 600 }}>My Stands</a>
                            </p>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: onboardingCompleted.features ? '#f0fdf4' : '#fefce8', borderRadius: '12px', border: `1px solid ${onboardingCompleted.features ? '#bbf7d0' : '#fde68a'}` }}>
                        <span style={{ fontSize: '1.2rem' }}>{onboardingCompleted.features ? '✅' : '⏭️'}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 700, color: '#1f2937', fontSize: '0.9rem' }}>Pro Features</span>
                          {!onboardingCompleted.features && (
                            <p style={{ fontSize: '0.78rem', color: '#92400e', margin: '2px 0 0' }}>
                              Connect later: ☰ Menu → <a href="/pro-manage" style={{ color: '#166534', textDecoration: 'underline', fontWeight: 600 }}>Manage Pro Features</a>
                            </p>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: onboardingCompleted.listing ? '#f0fdf4' : '#fefce8', borderRadius: '12px', border: `1px solid ${onboardingCompleted.listing ? '#bbf7d0' : '#fde68a'}` }}>
                        <span style={{ fontSize: '1.2rem' }}>{onboardingCompleted.listing ? '✅' : '⏭️'}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 700, color: '#1f2937', fontSize: '0.9rem' }}>First Listing</span>
                          {!onboardingCompleted.listing && (
                            <p style={{ fontSize: '0.78rem', color: '#92400e', margin: '2px 0 0' }}>
                              Create later: <a href="/create-listing" style={{ color: '#166534', textDecoration: 'underline', fontWeight: 600 }}>Create Listing</a> or from the Market page
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
                      <button
                        type="button"
                        className="btn-action"
                        onClick={() => router.push('/market')}
                      >
                        Go to Market →
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push('/pro-manage')}
                        style={{ background: '#f1f5f9', color: '#334155', border: 'none', padding: '14px 20px', fontSize: '0.95rem', fontWeight: 700, borderRadius: '14px', cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        Manage Pro Features
                      </button>
                    </div>
                  </div>
                )}

                {step === 'lite_intent' && (
                  <div style={{ animation: 'fadeIn 0.5s ease' }}>
                    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>👋</div>
                      <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>Welcome to CasaGrown!</h2>
                      <p style={{ fontSize: '0.95rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                        Your account is ready. What would you like to do first?
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                      <button
                        type="button"
                        onClick={() => router.push('/market')}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                          padding: '20px 12px', borderRadius: '16px', border: '2px solid #e2e8f0',
                          background: 'white', cursor: 'pointer', transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#f0fdf4' }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white' }}
                      >
                        <span style={{ fontSize: '2rem' }}>🛒</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>Buy Fresh Produce</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.3 }}>Browse what your neighbors are growing</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => router.push('/create-listing')}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                          padding: '20px 12px', borderRadius: '16px', border: '2px solid #e2e8f0',
                          background: 'white', cursor: 'pointer', transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#f0fdf4' }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white' }}
                      >
                        <span style={{ fontSize: '2rem' }}>🌱</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>Sell My Harvest</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.3 }}>List something you're growing</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => router.push('/growbot')}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                          padding: '20px 12px', borderRadius: '16px', border: '2px solid #e2e8f0',
                          background: 'white', cursor: 'pointer', transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#f0fdf4' }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white' }}
                      >
                        <span style={{ fontSize: '2rem' }}>🤖</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>Ask GrowBot</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.3 }}>AI gardening tips & plant care</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => router.push('/community')}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                          padding: '20px 12px', borderRadius: '16px', border: '2px solid #e2e8f0',
                          background: 'white', cursor: 'pointer', transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#f0fdf4' }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white' }}
                      >
                        <span style={{ fontSize: '2rem' }}>👥</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>Join Community</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.3 }}>Connect with neighborhood growers</span>
                      </button>
                    </div>

                    <p style={{ fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center', margin: '16px 0 0', lineHeight: 1.5 }}>
                      You can always access everything from the menu at <strong>casagrown.com</strong>
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="mobile-incentives">
            {incentivesContent}
          </div>
        </div>
      </div>

      {showCheckout && (
        <StripeCheckoutModal
          plan={selectedPlan as 'pro' | 'elite'}
          returnPath={`/p/${slug}`}
          onClose={() => {
            setShowCheckout(false)
            setSubmitting(false)
            if (step === 'payment' && !checkoutSessionId) {
              setStep('profile')
            }
          }}
          onComplete={async (sessionId) => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              // If user is already authenticated (logged in registered user checkout flow)
              await handlePaymentCompleteAfterLogin(sessionId)
            } else {
              // Standard new subscriber checkout flow
              await handlePaymentComplete(sessionId)
            }
          }}
        />
      )}

      {modalContent && (
        <div className="modal-overlay" onClick={() => setModalContent(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalContent(null)}>×</button>
            <h2>{modalContent === 'tos' ? 'Terms of Use' : 'Privacy Policy'}</h2>
            <div className="modal-body" style={{ overflowY: 'auto', padding: '32px' }}>
              {(modalContent === 'tos' ? TERMS_SECTIONS : PRIVACY_SECTIONS).map((section, si) => (
                <div key={si} style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: '#1f2937', marginBottom: '12px', fontWeight: 700 }}>{section.title}</h3>
                  {section.paragraphs.map((p, pi) => (
                    <p key={pi} style={{ fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.6, marginBottom: '12px' }}>{p}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function PromoPage() {
  return (
    <div className="casagrown-promo-page">
      {/* Sticky Premium Navbar */}
      <nav className="casagrown-nav">
        <div className="nav-left">
          <Link href="https://casagrown.com" className="nav-brand">
            <img src="/logo.png" alt="CasaGrown" className="nav-logo-img" />
            <span className="nav-brand-name">CasaGrown</span>
          </Link>
          <span className="nav-tagline">Fresh. Local. Trusted.</span>
        </div>
      </nav>

      <Suspense fallback={<div className="promo-loading"><div className="spinner"></div>Loading...</div>}>
        <PromoContent />
      </Suspense>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .casagrown-promo-page {
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
          position: relative;
          display: flex;
          flex-direction: column;
          color: #1a3320;
          overflow-x: hidden;
        }

        /* Background Layers */
        .promo-bg-layer {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background-size: cover;
          background-position: center;
          z-index: -2;
          transform: scale(1.02);
        }
        .promo-bg-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(135deg, rgba(20,83,45,0.75) 0%, rgba(15,23,42,0.65) 100%);
          z-index: -1;
        }

        /* Navbar */
        .casagrown-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 40px;
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.4);
          box-shadow: 0 4px 30px rgba(0,0,0,0.05);
          z-index: 10;
        }
        .nav-left { display: flex; align-items: center; gap: 20px; }
        .nav-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
        .nav-brand-name { font-weight: 800; font-size: 1.4rem; color: #14532d; letter-spacing: -0.5px; }
        .nav-logo-img { height: 40px; width: auto; }
        .nav-tagline { font-weight: 600; font-size: 0.95rem; color: #166534; letter-spacing: 0.5px; border-left: 2px solid #bbf7d0; padding-left: 20px; }

        /* Main Content Wrapper */
        .promo-content-wrapper {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 50px 24px;
        }

        /* Glassmorphism Card */
        .promo-main-glass {
          display: flex;
          flex-direction: row;
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 32px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.3) inset;
          max-width: 1160px;
          width: 100%;
          overflow: hidden;
        }

        /* Split layout */
        .promo-hero-section {
          flex: 1;
          min-width: 0;
          padding: 50px;
          background: rgba(220, 252, 231, 0.35);
          border-right: 1px solid rgba(255,255,255,0.5);
          display: flex;
          flex-direction: column;
        }
        .promo-form-section {
          flex: 1.1;
          min-width: 0;
          padding: 50px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
        }

        /* Text & Badges */
        .promo-headline { font-size: 2.8rem; font-weight: 800; color: #14532d; line-height: 1.1; margin-bottom: 20px; letter-spacing: -1px; }
        .promo-description { font-size: 1.1rem; color: #166534; line-height: 1.6; margin-bottom: 28px; }
        .promo-description p { margin-bottom: 12px; }
        
        .promo-badge { display: inline-flex; align-items: center; padding: 10px 20px; border-radius: 30px; font-weight: 700; font-size: 0.95rem; margin-bottom: 32px; align-self: flex-start; }
        .promo-badge.active { background: #bbf7d0; color: #14532d; border: 1px solid #86efac; }
        .promo-badge.deadline-passed { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

        /* Progress steps bar */
        .progress-steps {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 32px;
          background: rgba(255, 255, 255, 0.6);
          padding: 12px 18px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.8);
          max-width: fit-content;
        }
        .progress-step {
          display: flex;
          align-items: center;
          gap: 6px;
          opacity: 0.5;
          transition: all 0.3s ease;
        }
        .progress-step.active {
          opacity: 1;
        }
        .progress-step.completed {
          opacity: 0.9;
        }
        .step-num {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #e2e8f0;
          color: #475569;
          font-size: 11px;
          font-weight: 700;
        }
        .progress-step.active .step-num {
          background: #166534;
          color: white;
        }
        .progress-step.completed .step-num {
          background: #22c55e;
          color: white;
        }
        .step-label {
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .progress-step.active .step-label {
          color: #166534;
        }

        /* Selectable Tier Cards */
        .tier-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }
        .tier-card {
          background: rgba(248, 250, 252, 0.8);
          border: 2px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px;
          cursor: pointer;
          position: relative;
          transition: all 0.25s ease;
          display: flex;
          flex-direction: column;
        }
        .tier-card:hover {
          transform: translateY(-2px);
          border-color: #cbd5e1;
          box-shadow: 0 8px 20px rgba(0,0,0,0.04);
        }
        .tier-card.selected {
          border-color: #22c55e;
          background: #f0fdf4;
          box-shadow: 0 12px 24px rgba(34,197,94,0.08);
        }
        .tier-card-title {
          font-size: 14px;
          font-weight: 800;
          color: #334155;
          margin-bottom: 6px;
        }
        .tier-card.selected .tier-card-title {
          color: #14532d;
        }
        .tier-card-price {
          margin-bottom: 12px;
          display: flex;
          flex-direction: column;
        }
        .price-strike {
          font-size: 11px;
          color: #94a3b8;
          text-decoration: line-through;
          line-height: 1;
          margin-bottom: 2px;
        }
        .price-active {
          font-size: 18px;
          font-weight: 800;
          color: #1e293b;
        }
        .tier-card.selected .price-active {
          color: #166534;
        }
        .price-period {
          font-size: 11px;
          font-weight: 500;
          color: #64748b;
        }
        .tier-card-details {
          font-size: 11px;
          color: #64748b;
          line-height: 1.5;
          margin-top: auto;
        }
        .tier-card.selected .tier-card-details {
          color: #166534;
        }
        .tier-extra-feat {
          font-weight: 600;
          margin-top: 4px;
          color: #a855f7;
        }
        .tier-card.selected .tier-extra-feat {
          color: #7e22ce;
        }
        .tier-discount-badge {
          position: absolute;
          top: -10px;
          right: 10px;
          background: #a855f7;
          color: white;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 10px;
          box-shadow: 0 4px 10px rgba(168,85,247,0.25);
        }

        /* Incentive Items */
        .desktop-incentives { display: block; margin-top: auto; }
        .mobile-incentives { display: none; }
        .promo-incentive-grid { display: flex; flex-direction: column; gap: 16px; }
        .incentive-item { display: flex; align-items: center; gap: 14px; background: rgba(255,255,255,0.85); backdrop-filter: blur(12px); padding: 18px; border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.06); border: 1px solid rgba(255,255,255,0.8); }
        .incentive-icon { font-size: 2.2rem; flex-shrink: 0; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); }
        .incentive-text { flex: 1; min-width: 0; }
        .incentive-text strong, .incentive-text p { word-wrap: break-word; overflow-wrap: break-word; white-space: normal; }
        .incentive-photo { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; flex-shrink: 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .incentive-text strong { display: block; font-size: 1rem; color: #166534; margin-bottom: 4px; }
        .incentive-text p { font-size: 0.9rem; color: #4b5563; margin: 0; line-height: 1.4; }
        .giveaway-html { font-size: 0.9rem; color: #4b5563; line-height: 1.4; margin: 0; }
        .giveaway-html p { margin-bottom: 6px; }
        .credit-rules { list-style: none; padding: 0; margin-top: 8px; }
        .credit-rules li { font-size: 0.8rem; color: #166534; font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; }

        /* Form Styles */
        .dynamic-form { display: flex; flex-direction: column; gap: 24px; background: white; padding: 40px; border-radius: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.05); }
        .form-heading { font-size: 1.8rem; font-weight: 800; color: #14532d; margin-bottom: 6px; letter-spacing: -0.5px; }
        .form-subheading { font-size: 0.95rem; color: #4b5563; margin-bottom: 16px; line-height: 1.5; }
        
        .input-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
        .input-group label { font-size: 0.85rem; font-weight: 700; color: #374151; }
        .input-group input { width: 100%; box-sizing: border-box; padding: 14px 18px; border: 2px solid #e5e7eb; border-radius: 14px; font-size: 0.95rem; transition: all 0.2s ease; background: #f9fafb; color: #1f2937; }
        .input-group input:focus { outline: none; border-color: #22c55e; background: white; box-shadow: 0 0 0 4px rgba(34,197,94,0.1); }
        
        .use-location-btn {
          background: none;
          border: none;
          color: #166534;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .use-location-btn:hover {
          background: #f0fdf4;
          color: #14532d;
        }
        .use-location-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .input-row { display: flex; gap: 12px; }
        
        .otp-group input { font-size: 1.5rem; letter-spacing: 4px; text-align: center; font-weight: 700; }

        .checkbox-wrap { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; margin-bottom: 24px; padding: 14px; background: #f9fafb; border-radius: 14px; border: 1px solid #e5e7eb; transition: all 0.2s; }
        .checkbox-wrap:hover { background: #f3f4f6; }
        .checkbox-wrap input { margin-top: 4px; width: 18px; height: 18px; accent-color: #22c55e; cursor: pointer; }
        .checkbox-text { font-size: 0.88rem; color: #4b5563; line-height: 1.5; font-weight: 500; }
        .link-button { background: none; border: none; padding: 0; color: #166534; text-decoration: underline; font-weight: 700; cursor: pointer; font-family: inherit; font-size: inherit; }
        .link-button:hover { color: #14532d; }

        .modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal-content { background: white; border-radius: 24px; width: 100%; max-width: 800px; height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); position: relative; animation: fadeInUp 0.3s ease-out; }
        .modal-close { position: absolute; top: 20px; right: 20px; background: #f1f5f9; border: none; width: 40px; height: 40px; border-radius: 20px; font-size: 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #4b5563; transition: background 0.2s; }
        .modal-close:hover { background: #e2e8f0; color: #1f2937; }
        .modal-content h2 { padding: 24px 32px; margin: 0; border-bottom: 1px solid #e5e7eb; font-size: 1.5rem; color: #1f2937; }
        .modal-body { flex: 1; padding: 0; background: #f8fafc; }

        .btn-action { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; padding: 16px 28px; font-size: 1.05rem; font-weight: 800; border-radius: 14px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); width: 100%; box-shadow: 0 10px 25px rgba(34,197,94,0.25); }
        .btn-action:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(34,197,94,0.35); }
        .btn-action:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }

        .form-error-banner { background: #fef2f2; border-left: 4px solid #ef4444; color: #991b1b; padding: 14px; border-radius: 12px; font-weight: 600; font-size: 0.9rem; margin-bottom: 16px; }
        
        .form-success-state { text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 0; }
        .success-icon { font-size: 4rem; margin-bottom: 18px; animation: bounce 2s infinite ease-in-out; }
        .form-success-state h2 { font-size: 2rem; font-weight: 800; color: #15803d; margin-bottom: 12px; }
        .form-success-state p { font-size: 0.95rem; color: #4b5563; font-weight: 500; line-height: 1.6; max-width: 320px; }

        .form-error-state { text-align: center; background: #fee2e2; color: #991b1b; padding: 40px; border-radius: 24px; font-size: 1.1rem; font-weight: 600; }
        .promo-error-page { text-align: center; padding: 60px; font-size: 1.4rem; font-weight: 600; color: #991b1b; background: #fef2f2; margin: 40px; border-radius: 24px; }
        .checkout-loading-box { border: 1px dashed #e2e8f0; border-radius: 16px; padding: 32px 16px; background: #f8fafc; }

        /* Utilities */
        .fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }

        .promo-loading { display: flex; flex-direction: column; gap: 20px; align-items: center; justify-content: center; height: 100vh; font-size: 1.1rem; font-weight: 600; color: #166534; }
        .spinner { width: 36px; height: 36px; border: 4px solid rgba(34,197,94,0.2); border-left-color: #22c55e; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        /* Responsive Design */
        @media (max-width: 960px) {
          .promo-content-wrapper { padding: 20px 16px; align-items: flex-start; }
          .promo-main-glass { flex-direction: column; }
          .promo-hero-section { 
            padding: 32px 24px; 
            border-right: none; 
            border-bottom: 1px solid rgba(255,255,255,0.5); 
          }
          .tier-cards-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .desktop-incentives { display: none; }
          .mobile-incentives { 
            display: block; 
            padding: 32px 24px; 
            background: rgba(220, 252, 231, 0.35); 
            border-top: 1px solid rgba(255,255,255,0.5); 
          }
          .promo-form-section { padding: 32px 24px; }
          .promo-headline { font-size: 2rem; margin-bottom: 16px; }
          .casagrown-nav { padding: 16px 24px; text-align: center; }
          .nav-left { flex-direction: column; gap: 8px; align-items: center; width: 100%; }
          .nav-brand { flex-direction: row; justify-content: center; gap: 12px; }
          .nav-tagline { border-left: none; padding-left: 0; width: 100%; }
          .promo-badge { margin-bottom: 16px; }
          .incentive-item { padding: 14px; gap: 10px; }
          .incentive-icon { font-size: 1.8rem; }
          .incentive-photo { width: 48px; height: 48px; }
          .progress-steps { margin-bottom: 24px; max-width: 100%; justify-content: center; }
        }

        .promo-choice-container {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          width: 100%;
        }
        .promo-choice-cards {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          margin-top: 16px;
        }
        .choice-card {
          background: rgba(255, 255, 255, 0.7);
          border: 2px solid #e2e8f0;
          border-radius: 20px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .choice-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(0,0,0,0.06);
        }
        .choice-card.new-promo-card {
          border-color: #a855f7;
          background: rgba(250, 245, 255, 0.6);
        }
        .choice-card.new-promo-card:hover {
          box-shadow: 0 12px 30px rgba(168,85,247,0.1);
        }
        .choice-card-badge {
          position: absolute;
          top: -12px;
          left: 20px;
          background: #3b82f6;
          color: white;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 12px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 4px 10px rgba(59,130,246,0.25);
        }
        .choice-card-badge.new-badge {
          background: #a855f7;
          box-shadow: 0 4px 10px rgba(168,85,247,0.25);
        }
        .choice-title {
          font-size: 1.2rem;
          font-weight: 800;
          color: #1e293b;
          margin-top: 8px;
          margin-bottom: 8px;
          line-height: 1.3;
        }
        .choice-discount-value {
          font-size: 1.8rem;
          font-weight: 900;
          color: #3b82f6;
          margin-bottom: 12px;
        }
        .choice-discount-value.purple-text {
          color: #a855f7;
        }
        .choice-description {
          font-size: 0.9rem;
          color: #4b5563;
          line-height: 1.5;
          margin-bottom: 24px;
          flex: 1;
        }
        .choice-btn {
          border: none;
          padding: 14px 20px;
          font-size: 0.95rem;
          font-weight: 800;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          text-align: center;
        }
        .choice-btn-secondary {
          background: #e2e8f0;
          color: #334155;
        }
        .choice-btn-secondary:hover:not(:disabled) {
          background: #cbd5e1;
        }
        .choice-btn-primary {
          background: linear-gradient(135deg, #a855f7, #7e22ce);
          color: white;
          box-shadow: 0 6px 20px rgba(168,85,247,0.25);
        }
        .choice-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 25px rgba(168,85,247,0.35);
        }
        .choice-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: none !important;
        }
        
        @media (max-width: 640px) {
          .promo-choice-cards {
            grid-template-columns: 1fr;
            gap: 24px;
          }
        }

        @media (max-width: 600px) {
          .promo-content-wrapper { padding: 16px 12px; }
          .promo-main-glass { border-radius: 20px; }
          .promo-hero-section { padding: 24px 16px; }
          .promo-form-section { padding: 24px 16px; }
          .promo-headline { font-size: 1.6rem; }
          .casagrown-nav { padding: 12px 16px; }
        }
      `}</style>
    </div>
  )
}
