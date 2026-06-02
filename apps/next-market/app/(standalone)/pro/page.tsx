'use client'

import React, { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { ENABLE_ELITE } from '../../../lib/featureFlags'
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '../../(main)/terms/page'
import { StripeCheckoutModal } from '../../components/StripeCheckoutModal'

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
  sub_discounts?: Record<string, {
    discount_pct: number;
    duration_months: number | null;
    platform_fee_reduction_pct: number;
    stripe_fee_handling_override: string;
  }>
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

function ProContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const campaign_id = searchParams.get('campaign_id')
  const promo_id = searchParams.get('promo')
  const slug = searchParams.get('slug') || ''

  const [loading, setLoading] = useState(true)
  const [promo, setPromo] = useState<PromotionDetails | null>(null)
  const [tiers, setTiers] = useState<PlanTier[]>(DEFAULT_TIERS)
  const [promoDiscounts, setPromoDiscounts] = useState<any[]>([])
  const [selectedPlan, setSelectedPlan] = useState<'lite' | 'pro' | 'elite'>('pro')
  const [errorMsg, setErrorMsg] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  const [isExistingUser, setIsExistingUser] = useState(false)
  const [isEmailFlow, setIsEmailFlow] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  // Wizard steps: 'initial' | 'profile' | 'otp' | 'promo_choice' | 'payment' | 'success'
  const [step, setStep] = useState<'initial' | 'profile' | 'otp' | 'promo_choice' | 'payment' | 'success'>('initial')
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

  const supabase = createClient()

  // Check if user is a pro_tester (sees all tiers regardless of flags)
  useEffect(() => {
    if (ENABLE_ELITE) return // flag is on, no need to check
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

    // Detect if arriving from an email link (existing user flow)
    const utmSource = searchParams.get('utm_source') || ''
    if (utmSource.toLowerCase().includes('email') && isCurrent) {
      setIsEmailFlow(true)
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
            setPhone(profile.phone_number || profile.phone || session.user.user_metadata?.phone || '')
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
              } else {
                setStreet(profile.street_address)
              }
            }
            // Fallback: read separate address columns if combined parsing missed them
            if (profile.city && !city) setCity(profile.city)
            if (profile.state_code && !state) setState(profile.state_code)
            if (profile.zip_plus4 && !zip) setZip(profile.zip_plus4)
            if (profile.farm_name) {
              setFarmName(profile.farm_name)
            }
            if (profile.tos_accepted_at) {
              setTosAccepted(true)
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

  // Load Pricing & Promotion details
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

        let targetPromo = null

        // 1. First, check URL params
        if (slug || promo_id) {
          const { data: promoData, error: rpcErr } = await supabase
            .rpc('crm_get_landing_page_promotion', { p_slug: slug, p_promo_id: promo_id || null })
          
          if (!rpcErr && promoData) {
            targetPromo = {
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
            }
          }
        } 
        // 2. If no URL params, load active universal promotion (audience_id IS NULL)
        else {
          const { data: promoList, error: queryErr } = await supabase
            .from('crm_promotions')
            .select(`
              *,
              giveaway: crm_promo_giveaways(*),
              buyer_discounts: crm_promo_buyer_discounts(*),
              sub_discounts: crm_promo_subscription_discounts(*)
            `)
            .is('audience_id', null)
            .gt('enrollment_deadline', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)

          if (!queryErr && promoList && promoList.length > 0) {
            const rawPromo = promoList[0]
            if (rawPromo.current_enrollees < rawPromo.max_enrollees) {
              const subDiscountsRecord: Record<string, any> = {}
              if (rawPromo.sub_discounts && Array.isArray(rawPromo.sub_discounts)) {
                rawPromo.sub_discounts.forEach((sd: any) => {
                  subDiscountsRecord[sd.plan] = {
                    discount_pct: sd.discount_pct,
                    duration_months: sd.duration_months,
                    platform_fee_reduction_pct: sd.platform_fee_reduction_pct,
                    stripe_fee_handling_override: sd.stripe_fee_handling_override
                  }
                })
              }

              const activeDisc = subDiscountsRecord[selectedPlan]

              targetPromo = {
                id: rawPromo.id,
                name: rawPromo.name,
                description_html: rawPromo.description_html,
                enrollment_deadline: rawPromo.enrollment_deadline,
                allow_existing_users: rawPromo.allow_existing_users,
                is_capacity_reached: false,
                giveaway: rawPromo.giveaway && rawPromo.giveaway.length > 0 ? rawPromo.giveaway[0] : undefined,
                buyer_discounts: rawPromo.buyer_discounts && rawPromo.buyer_discounts.length > 0 ? rawPromo.buyer_discounts[0] : undefined,
                sub_discount: activeDisc ? {
                  discount_pct: activeDisc.discount_pct,
                  duration_months: activeDisc.duration_months,
                  pro_monthly_price: activeDisc.pro_monthly_price || 10
                } : undefined,
                sub_discounts: subDiscountsRecord,
                hero_image_url: rawPromo.hero_image_url || null
              }
            }
          }
        }

        if (targetPromo && isCurrent) {
          setPromo(targetPromo)

          // Load dynamic overrides/discounts for the promotion
          const { data: dbDiscounts } = await supabase
            .from('crm_promo_subscription_discounts')
            .select('*')
            .eq('promotion_id', targetPromo.id)

          if (dbDiscounts) {
            setPromoDiscounts(dbDiscounts)
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch promotion:', err)
      } finally {
        if (isCurrent) setLoading(false)
      }
    }
    fetchData()
    return () => { isCurrent = false }
  }, [slug, promo_id, supabase])

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
          
          localStorage.removeItem('casagrown_promo_onboarding')

          // Check if user is already authenticated (email flow — they verified before payment)
          const completeAfterAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
              // Already logged in — skip OTP, confirm subscription directly
              setCheckoutSessionId(sessionIdParam)
              setSubmitting(true)
              setErrorMsg('')
              try {
                await supabase.functions.invoke('manage-subscription', {
                  body: { action: 'confirm', session_id: sessionIdParam },
                })

                if (promo) {
                  await supabase.rpc('crm_enroll_in_promotion', { 
                    p_promotion_id: promo.id,
                    p_campaign_id: campaign_id || null
                  })
                }

                const fullAddress = `${saved.street}, ${saved.city}, ${saved.state} ${saved.zip}`
                await supabase
                  .from('profiles')
                  .update({
                    full_name: saved.name,
                    street_address: saved.street,
                    city: saved.city,
                    state_code: saved.state,
                    zip_code: saved.zip,
                    phone: saved.phone,
                    sms_consent: saved.smsConsent ?? true,
                    farm_name: saved.farmName,
                    is_pro: true
                  })
                  .eq('id', session.user.id)

                setSuccessMessage("🎉 Payment Successful! Your new plan has been activated. Let's set up your Pro features!")
                setStep('success')
                setTimeout(() => {
                  router.push('/pro-manage')
                }, 3000)
              } catch (err: any) {
                setErrorMsg(err.message || 'Payment completed but failed to activate plan.')
              } finally {
                setSubmitting(false)
              }
            } else {
              // Not logged in — need OTP verification first
              setCheckoutSessionId(sessionIdParam)
              setStep('otp')
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
          }
          completeAfterAuth()
        } catch (e) {
          console.error('Failed to restore onboarding state:', e)
        }
      }
    }
  }, [isMounted, searchParams, supabase])

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
    } else if (promo && promo.sub_discounts && promo.sub_discounts[tierName]) {
      // Fallback lookup from universal parsed sub_discounts map
      const disc = promo.sub_discounts[tierName]
      discountPct = disc.discount_pct
      finalPrice = regularPrice * (1 - discountPct / 100)
      feeReduction = disc.platform_fee_reduction_pct || 0
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
      if (promo) {
        const { data, error } = await supabase.rpc('crm_check_promo_eligibility', { p_promo_id: promo.id, p_email: email })
        if (error) throw error
        
        if (!data.eligible) {
          setFallbackMode({ message: data.error })
          setSubmitting(false)
          return
        }

        if (data.is_registered) {
          setIsExistingUser(true)
          // Email flow: existing user from email link → send OTP first, fill profile after
          if (isEmailFlow) {
            const { error: otpErr } = await supabase.auth.signInWithOtp({ email })
            if (otpErr) throw otpErr
            setStep('otp')
            setSubmitting(false)
            return
          }
        } else {
          setIsExistingUser(false)
        }
      } else {
        // Standard user login check if no promo active
        const { data: userExists } = await supabase.rpc('is_email_registered', { p_email: email })
        setIsExistingUser(!!userExists)
        // Email flow: existing user from email link → send OTP first, fill profile after
        if (isEmailFlow && userExists) {
          const { error: otpErr } = await supabase.auth.signInWithOtp({ email })
          if (otpErr) throw otpErr
          setStep('otp')
          setSubmitting(false)
          return
        }
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
    if (!name || !street || !city || !state || !zip || !tosAccepted) return
    
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
          form_version: 'v2-pro-funnel',
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

          setSuccessMessage("🎉 Welcome to CasaGrown Lite! Your account is set up with your current promotion. Redirecting to the market...")
          setStep('success')
          setTimeout(() => {
            router.push('/market')
          }, 3000)
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

          setSuccessMessage("🎉 Welcome back! We detected your existing credit card on file. Your subscription has been successfully updated with your campaign discounts, and your billing has been adjusted automatically! Let's create your first listing!")
          setStep('success')
          setTimeout(() => {
            router.push('/create-listing')
          }, 4000)
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
              data: { full_name: name, street_address: street, city, state_code: state, zip_code: zip, phone, sms_consent: smsConsent, tos_accepted: true }
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
              data: { full_name: name, street_address: street, city, state_code: state, zip_code: zip, phone, sms_consent: smsConsent, tos_accepted: true, farm_name: farmName }
            }
          })
          if (error) throw error
          setStep('otp')
        }
        // 3. New paid subscribers: OTP first, then payment after verification
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
          const fullAddress = `${street}, ${city}, ${state} ${zip}`
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
              data: { full_name: name, street_address: street, city, state_code: state, zip_code: zip, phone, sms_consent: smsConsent, tos_accepted: true, farm_name: farmName }
            }
          })
          if (error) throw error
          setStep('otp')
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
            city, 
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
      await supabase.functions.invoke('manage-subscription', {
        body: { action: 'confirm', session_id: sessionId, plan: selectedPlan },
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

      setSuccessMessage("🎉 Payment Successful! Your new plan has been successfully activated. Let's set up your Pro features!")
      setStep('success')
      setTimeout(() => {
        router.push('/pro-manage')
      }, 3000)
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

        setSuccessMessage("🎉 Welcome to CasaGrown Lite! Your account is set up with your current promotion. Redirecting to the market...")
        setStep('success')
        setTimeout(() => {
          router.push('/market')
        }, 3000)
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

        setSuccessMessage("🎉 Welcome back! We detected your existing credit card on file. Your subscription has been successfully updated while keeping your current promotion rate! Let's create your first listing!")
        setStep('success')
        setTimeout(() => {
          router.push('/create-listing')
        }, 4000)
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

          setSuccessMessage("🎉 Payment Successful! Your new plan has been successfully activated with your current promotion rate. Let's create your first listing!")
          setStep('success')
          setTimeout(() => {
            router.push('/create-listing')
          }, 3000)
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

        setSuccessMessage("🎉 Welcome to CasaGrown Lite! Your account is set up with your new promotion. Redirecting to the market...")
        setStep('success')
        setTimeout(() => {
          router.push('/market')
        }, 3000)
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

        setSuccessMessage("🎉 Welcome back! We detected your existing credit card on file. Your subscription has been successfully updated with your new campaign discounts! Let's create your first listing!")
        setStep('success')
        setTimeout(() => {
          router.push('/create-listing')
        }, 4000)
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

          setSuccessMessage("🎉 Payment Successful! Your new plan has been successfully activated with your new promotion rate. Let's create your first listing!")
          setStep('success')
          setTimeout(() => {
            router.push('/create-listing')
          }, 3000)
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

      // Email flow: after OTP, pre-fill profile from DB and go to profile step for review
      if (isEmailFlow && isExistingUser && session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()

        if (profile) {
          setName(profile.full_name || '')
          setPhone(profile.phone_number || profile.phone || '')
          setFarmName(profile.farm_name || '')
          setSmsConsent(profile.sms_consent ?? true)
          // Existing user verified via OTP — auto-accept ToS
          setTosAccepted(true)
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
            } else {
              setStreet(profile.street_address)
            }
          }
          // Fallback: read separate address columns if combined parsing missed them
          if (profile.city) setCity(profile.city)
          if (profile.state_code) setState(profile.state_code)
          if (profile.zip_plus4) setZip(profile.zip_plus4)
        }
        setStep('profile')
        setSubmitting(false)
        return
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

      if (existingDiscount && existingDiscount.promotion_id !== promo?.id) {
        setActivePromoDiscount(existingDiscount)
        setStep('promo_choice')
        setSubmitting(false)
        return
      }

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

        setSuccessMessage("🎉 Welcome to CasaGrown Lite! Your account is set up. Redirecting to the market...")
        setStep('success')
        setTimeout(() => {
          router.push('/market')
        }, 3000)
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
          .eq('user_id', session?.user?.id || '')

        await supabase
          .from('profiles')
          .update({ farm_name: farmName, is_pro: true })
          .eq('id', session?.user?.id || '')

        setSuccessMessage("🎉 Welcome back! We detected your existing credit card on file. Your subscription has been successfully updated with your campaign discounts, and your billing has been adjusted automatically! Let's create your first listing!")
        setStep('success')
        setTimeout(() => {
          router.push('/create-listing')
        }, 4000)
      }
      else {
        if (checkoutSessionId) {
          await supabase.functions.invoke('manage-subscription', {
            body: { action: 'confirm', session_id: checkoutSessionId, plan: selectedPlan },
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

          setSuccessMessage("🎉 Payment Successful! Your new plan has been successfully activated with your promotional discounts. Let's create your first listing!")
          setStep('success')
          setTimeout(() => {
            router.push('/create-listing')
          }, 3000)
        } else {
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

  if (loading) return <div className="promo-loading"><div className="spinner"></div>Loading Onboarding...</div>

  const bgImage = promo?.hero_image_url || getBackgroundImage()

  const incentivesContent = (
    <div className="promo-incentive-grid">
      {promo?.giveaway && (
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
      {promo?.buyer_discounts && (
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
            <h1 className="promo-headline">{promo?.name || 'Start Selling Local'}</h1>
            {promo?.description_html ? (
              <div className="promo-description" dangerouslySetInnerHTML={{ __html: promo.description_html.replace(/&nbsp;/g, ' ') }} />
            ) : (
              <p className="promo-description">
                Grow local, sell fresh, and manage your custom stands. Setup your profile risk-free with our cancel-anytime guarantee.
              </p>
            )}

            {isMounted && promo && (
              <div className="promo-badge active">
                🎁 Universal Promo Active
              </div>
            )}

            {/* Dynamic Step Tracker */}
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

            <div className="desktop-incentives">
              {promo ? incentivesContent : (
                <div className="plan-summary-card" style={{ background: 'rgba(255,255,255,0.85)', padding: '24px', borderRadius: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ fontSize: '1.2rem', color: '#166534', fontWeight: 800, marginBottom: '8px' }}>Standard Onboarding</h3>
                  <p style={{ fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.5 }}>
                    Select Lite Base ($0/mo), Pro ($10/mo), or Elite ($29/mo) and set up your local merchant stand.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="promo-form-section">
            {step === 'success' ? (
              <div className="form-success-state">
                <div className="success-icon">🎉</div>
                <h2>You're Enrolled!</h2>
                <p className="success-banner-msg">{successMessage || "🎉 Welcome! Your new plan has been successfully activated. Let's create your first listing!"}</p>
                <div className="spinner" style={{ margin: '20px auto 0' }}></div>
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
                    <h2 className="form-heading">Choose Your Stand</h2>
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
                            className={`tier-card tier-card-${tierKey} ${isSelected ? 'selected' : ''}`}
                          >
                            {tierKey === 'pro' && (
                              <div className="tier-popular-badge">⭐ MOST POPULAR</div>
                            )}
                            {details.hasDiscount && (
                              <div className="tier-discount-badge">{details.discountPct}% Off</div>
                            )}
                            <div className="tier-card-header">
                              <h3 className="tier-card-title">{tier.display_name}</h3>
                              <div className="tier-card-price">
                                {details.hasDiscount ? (
                                  <>
                                    <span className="price-active">${details.finalPrice.toFixed(2)}<span className="price-period">/mo</span></span>
                                    <span className="price-strike">${details.regularPrice.toFixed(2)}/mo</span>
                                  </>
                                ) : (
                                  <span className="price-active">${tier.subscription_price.toFixed(2)}{tier.subscription_price > 0 && <span className="price-period">/mo</span>}</span>
                                )}
                              </div>
                              <div className="tier-card-meta">
                                <span>Platform fee: <strong>{details.platformFee}%</strong></span>
                                <span>Booths: <strong>{tier.max_booths < 0 ? 'Unlimited' : tier.max_booths}</strong></span>
                              </div>
                              <p className="tier-card-headline">
                                {tierKey === 'lite' && 'Perfect for home gardeners with extra harvest'}
                                {tierKey === 'pro' && 'Never miss a sale — even when you\u2019re not there'}
                                {tierKey === 'elite' && 'Sell everywhere your buyers already are'}
                              </p>
                              {tierKey === 'pro' && (
                                <p className="tier-card-callout">GrowBot engages buyers, answers questions, and closes sales while you&apos;re at the farm, driving, or asleep</p>
                              )}
                              {tierKey === 'elite' && (
                                <p className="tier-card-callout">Post your inventory to Facebook, Instagram, WhatsApp &amp; Google Maps — generate pre-purchased orders that drive foot traffic to your booth</p>
                              )}
                            </div>
                            <div className="tier-card-benefits">
                              {tierKey === 'lite' && (
                                <>
                                  <div className="tier-benefits-section">
                                    <div className="tier-benefit-item">💰 <strong>Guaranteed orders</strong> — buyers pre-pay before you pick or pack. No wasted harvest, no no-shows</div>
                                    <div className="tier-benefit-item">🤝 <strong>Hassle-free handoff</strong> — buyers choose delivery or pickup with time windows. No back-and-forth coordination via text or DMs</div>
                                    <div className="tier-benefit-item">🛡️ <strong>Safe transactions</strong> — Stripe handles payments, photo proof confirms delivery, and disputes are resolved by our team</div>
                                  </div>
                                  <div className="tier-features-compact">
                                    <span>✓ Secure checkout</span>
                                    <span>✓ {tier.max_booths < 0 ? 'Unlimited' : tier.max_booths} booth</span>
                                    <span>✓ Photo listings</span>
                                    <span>✓ Delivery &amp; pickup scheduling</span>
                                  </div>
                                </>
                              )}
                              {tierKey === 'pro' && (
                                <>
                                  <div className="tier-benefits-section">
                                    <div className="tier-benefit-item">🤖 <strong>Never miss a sale</strong> — GrowBot engages buyers, answers questions &amp; closes deals while you&apos;re away</div>
                                    <div className="tier-benefit-item">👀 <strong>Monitor &amp; respond</strong> — AI watches your FB comments and DMs so no lead slips through</div>
                                    <div className="tier-benefit-item">🔔 <strong>Urgent alerts</strong> — get notified when a buyer needs your personal attention</div>
                                    <div className="tier-benefit-item">🚀 <strong>Drive foot traffic</strong> — post inventory to Facebook, generate pre-purchased orders that bring buyers to your booth</div>
                                  </div>
                                  <div className="tier-features-compact">
                                    <span>✓ GrowBot AI Copilot</span>
                                    <span>✓ Facebook catalog &amp; auto-post</span>
                                    <span>✓ Messenger &amp; comment auto-replies</span>
                                    <span>✓ Up to {tier.max_booths < 0 ? 'Unlimited' : tier.max_booths} booths</span>
                                    <span>✓ Product Catalog</span>
                                    <span>✓ Lower all-in fees (incl. credit card processing)</span>
                                    <span>✓ 7-day refund guarantee</span>
                                  </div>
                                </>
                              )}
                              {tierKey === 'elite' && (
                                <>
                                  <div className="tier-benefits-section">
                                    <div className="tier-benefit-item">📣 <strong>Sell everywhere</strong> — post inventory to Facebook + Instagram + WhatsApp + Google Maps automatically</div>
                                    <div className="tier-benefit-item">🛒 <strong>Pre-purchased orders</strong> — more channels = more pre-sales = more foot traffic to your booths</div>
                                    <div className="tier-benefit-item">🤖 <strong>AI on every channel</strong> — GrowBot closes sales in DMs and comments across all platforms</div>
                                    <div className="tier-benefit-item">📱 <strong>WhatsApp without the chaos</strong> — right now, your WhatsApp groups expose every customer&apos;s phone number to each other, you&apos;re tracking orders in Google Sheets, and there&apos;s no way to sync payments. With your own WhatsApp Business line, all of that is gone: customers browse your catalog, ask questions (answered automatically by GrowBot), and place &amp; pay for orders — all inside WhatsApp, all synced to your CasaGrown dashboard. Your personal number stays completely private</div>
                                  </div>
                                  <div className="tier-features-compact">
                                    <span>✓ Everything in Pro</span>
                                    <span>✓ Instagram auto-post &amp; Reels</span>
                                    <span>✓ WhatsApp Business phone (provisioned)</span>
                                    <span>✓ Google Maps listing</span>
                                    <span>✓ Unlimited booths</span>
                                    <span>✓ Premium branding</span>
                                    <span>✓ Lowest all-in fees (incl. credit card processing)</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="input-group">
                      <label>Email Address</label>
                      <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="hello@example.com" />
                    </div>
                    <button type="submit" disabled={submitting || !email} className="btn-action">
                      {submitting ? 'Checking eligibility...' : 'Continue to Onboarding'}
                    </button>
                  </form>
                )}

                {step === 'profile' && (
                  <form onSubmit={handleProfileSubmit} className="fade-in-up">
                    <h2 className="form-heading">Setup Your Profile</h2>
                    <p className="form-subheading">Create your profile to claim your stand setup benefits.</p>
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
                          placeholder="e.g. Oakridge Farms" 
                        />
                      </div>
                    )}

                    <div className="input-group">
                      <label>Full Name</label>
                      <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
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
                      <input type="text" required value={street} onChange={e => setStreet(e.target.value)} placeholder="123 Farm Road" />
                    </div>
                    <div className="input-row">
                      <div className="input-group" style={{ flex: 2 }}>
                        <label>City</label>
                        <input type="text" required value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
                      </div>
                      <div className="input-group" style={{ flex: '0 0 70px' }}>
                        <label>State</label>
                        <input type="text" required value={state} onChange={e => setState(e.target.value)} placeholder="ST" maxLength={2} />
                      </div>
                      <div className="input-group" style={{ flex: '0 0 110px' }}>
                        <label>ZIP Code</label>
                        <input type="text" required value={zip} onChange={e => setZip(e.target.value)} placeholder="12345" maxLength={5} />
                      </div>
                    </div>
                    <div className="input-group">
                      <label>Phone Number</label>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" />
                    </div>
                    <label className="checkbox-wrap" style={{ marginBottom: '16px' }}>
                      <input type="checkbox" checked={smsConsent} onChange={e => setSmsConsent(e.target.checked)} />
                      <div className="checkbox-text">
                        <strong>Enable Order SMS Notifications</strong>
                        <div style={{ fontSize: '0.8rem', marginTop: '4px', color: '#6b7280', lineHeight: 1.4 }}>
                          By providing your phone number and checking this box, you consent to receive critical transactional SMS notifications from CasaGrown. Reply STOP to cancel. Msg & data rates may apply.
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
                    <button type="submit" disabled={submitting || !name || !street || !city || !state || !zip || !tosAccepted || (userBooths.length > (selectedPlan === 'lite' ? 1 : selectedPlan === 'pro' ? 3 : 100) && selectedBoothsToKeep.length !== (selectedPlan === 'lite' ? 1 : selectedPlan === 'pro' ? 3 : 100))} className="btn-action">
                      {submitting ? 'Processing...' : (isEmailFlow && isExistingUser) ? 'Continue' : (selectedPlan === 'lite' || isExistingUser) ? 'Send Login Code' : 'Proceed to Checkout'}
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
                        <h3 className="choice-title">{promo?.name || 'New Promotion'}</h3>
                        <div className="choice-discount-value purple-text">
                          {selectedPlan && promo?.sub_discounts && promo.sub_discounts[selectedPlan] 
                            ? `${promo.sub_discounts[selectedPlan].discount_pct}% Off` 
                            : 'New discount'}
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
              </div>
            ) : null}
          </div>

          <div className="mobile-incentives">
            {promo ? incentivesContent : (
              <div className="plan-summary-card" style={{ background: 'rgba(255,255,255,0.85)', padding: '24px', borderRadius: '20px' }}>
                <h3 style={{ fontSize: '1.2rem', color: '#166534', fontWeight: 800, marginBottom: '8px' }}>Standard Onboarding</h3>
                <p style={{ fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.5 }}>
                  Select Lite Base ($0/mo), Pro ($10/mo), or Elite ($29/mo) and set up your local merchant stand.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCheckout && (
        <StripeCheckoutModal
          plan={selectedPlan as 'pro' | 'elite'}
          returnPath={`/pro`}
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
              await handlePaymentCompleteAfterLogin(sessionId)
            } else {
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

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .promo-content-wrapper {
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
          position: relative;
          display: flex;
          flex-direction: column;
          color: #1a3320;
          overflow-x: hidden;
          justify-content: center;
          align-items: center;
          padding: 50px 24px;
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

        /* Selectable Tier Cards — Vertical Stack Layout */
        .tier-cards-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 24px;
        }
        .tier-card {
          background: rgba(248, 250, 252, 0.9);
          border: 2px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px 24px;
          cursor: pointer;
          position: relative;
          transition: all 0.25s ease;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: hidden;
        }
        .tier-card:hover {
          transform: translateY(-2px);
          border-color: #cbd5e1;
          box-shadow: 0 8px 24px rgba(0,0,0,0.06);
        }
        .tier-card.selected {
          border-color: #22c55e;
          background: rgba(240, 253, 244, 0.95);
          box-shadow: 0 12px 28px rgba(34,197,94,0.12);
        }
        /* Pro card — green gradient border */
        .tier-card-pro {
          border: 2px solid transparent;
          background-image: linear-gradient(rgba(248,250,252,0.9), rgba(248,250,252,0.9)), linear-gradient(135deg, #22c55e, #16a34a, #15803d);
          background-origin: border-box;
          background-clip: padding-box, border-box;
        }
        .tier-card-pro.selected {
          background-image: linear-gradient(rgba(240,253,244,0.95), rgba(240,253,244,0.95)), linear-gradient(135deg, #22c55e, #16a34a, #15803d);
          background-origin: border-box;
          background-clip: padding-box, border-box;
          box-shadow: 0 12px 28px rgba(34,197,94,0.18);
        }
        /* MOST POPULAR badge */
        .tier-popular-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 16px;
          border-radius: 20px;
          box-shadow: 0 4px 12px rgba(34,197,94,0.3);
          white-space: nowrap;
          letter-spacing: 0.5px;
          z-index: 2;
        }
        .tier-discount-badge {
          position: absolute;
          top: -10px;
          right: 12px;
          background: #a855f7;
          color: white;
          font-size: 10px;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 10px;
          box-shadow: 0 4px 10px rgba(168,85,247,0.25);
          z-index: 2;
        }
        /* Header — left side */
        .tier-card-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tier-card-title {
          font-size: 18px;
          font-weight: 800;
          color: #334155;
          margin-bottom: 2px;
        }
        .tier-card.selected .tier-card-title {
          color: #14532d;
        }
        .tier-card-price {
          display: flex;
          flex-direction: column;
          margin-bottom: 6px;
        }
        .price-active {
          font-size: 24px;
          font-weight: 800;
          color: #1e293b;
          line-height: 1.2;
        }
        .tier-card.selected .price-active {
          color: #166534;
        }
        .price-strike {
          font-size: 12px;
          color: #94a3b8;
          text-decoration: line-through;
          line-height: 1;
          margin-top: 2px;
        }
        .price-period {
          font-size: 13px;
          font-weight: 500;
          color: #64748b;
        }
        .tier-card-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 8px;
        }
        .tier-card-headline {
          font-size: 13px;
          font-weight: 600;
          color: #475569;
          line-height: 1.4;
          margin: 0;
        }
        .tier-card.selected .tier-card-headline {
          color: #166534;
        }
        .tier-card-callout {
          font-size: 12px;
          font-weight: 600;
          color: #047857;
          line-height: 1.4;
          margin: 4px 0 0;
          padding: 6px 10px;
          background: rgba(220, 252, 231, 0.6);
          border-radius: 8px;
          border-left: 3px solid #22c55e;
        }
        /* Benefits — right side */
        .tier-card-benefits {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .tier-benefits-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tier-benefit-item {
          font-size: 13px;
          color: #374151;
          line-height: 1.5;
          padding: 6px 10px;
          background: rgba(240, 253, 244, 0.5);
          border-radius: 8px;
          border-left: 3px solid #86efac;
        }
        .tier-card.selected .tier-benefit-item {
          background: rgba(220, 252, 231, 0.6);
          border-left-color: #22c55e;
        }
        .tier-features-compact {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding-top: 8px;
          border-top: 1px dashed #e5e7eb;
        }
        .tier-features-compact span {
          font-size: 11px;
          color: #64748b;
          background: #f1f5f9;
          padding: 3px 10px;
          border-radius: 20px;
          white-space: nowrap;
        }
        .tier-card.selected .tier-features-compact span {
          background: #dcfce7;
          color: #166534;
        }
        .tier-feat-highlight {
          font-weight: 700;
          color: #047857;
        }
        .tier-card.selected .tier-features-grid {
          color: #166534;
        }

        /* Mobile: stack vertically */
        @media (max-width: 640px) {
          .tier-card {
            flex-direction: column;
            gap: 12px;
            padding: 16px;
          }
          .tier-card-header {
            flex: none;
            width: 100%;
          }
          .tier-features-grid {
            grid-template-columns: 1fr;
          }
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
        .dynamic-form { display: flex; flex-direction: column; gap: 24px; background: white; padding: 40px; border-radius: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.05); width: 100%; }
        .form-heading { font-size: 1.8rem; font-weight: 800; color: #14532d; margin-bottom: 6px; letter-spacing: -0.5px; }
        .form-subheading { font-size: 0.95rem; color: #4b5563; margin-bottom: 16px; line-height: 1.5; }
        
        .input-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; width: 100%; }
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
        
        .input-row { display: flex; gap: 12px; width: 100%; }
        
        .otp-group input { font-size: 1.5rem; letter-spacing: 4px; text-align: center; font-weight: 700; }

        .checkbox-wrap { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; margin-bottom: 24px; padding: 14px; background: #f9fafb; border-radius: 14px; border: 1px solid #e5e7eb; transition: all 0.2s; width: 100%; }
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

        .form-error-banner { background: #fef2f2; border-left: 4px solid #ef4444; color: #991b1b; padding: 14px; border-radius: 12px; font-weight: 600; font-size: 0.9rem; margin-bottom: 16px; width: 100%; }
        
        .form-success-state { text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 0; width: 100%; }
        .success-icon { font-size: 4rem; margin-bottom: 18px; animation: bounce 2s infinite ease-in-out; }
        .form-success-state h2 { font-size: 2rem; font-weight: 800; color: #15803d; margin-bottom: 12px; }
        .form-success-state p { font-size: 0.95rem; color: #4b5563; font-weight: 500; line-height: 1.6; max-width: 320px; }

        .form-error-state { text-align: center; background: #fee2e2; color: #991b1b; padding: 40px; border-radius: 24px; font-size: 1.1rem; font-weight: 600; width: 100%; }
        .checkout-loading-box { border: 1px dashed #e2e8f0; border-radius: 16px; padding: 32px 16px; background: #f8fafc; width: 100%; }

        /* Utilities */
        .fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }

        .promo-loading { display: flex; flex-direction: column; gap: 20px; align-items: center; justify-content: center; height: 100vh; font-size: 1.1rem; font-weight: 600; color: #166534; }
        .spinner { width: 36px; height: 36px; border: 4px solid rgba(34,197,94,0.2); border-left-color: #22c55e; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

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
          .promo-badge { margin-bottom: 16px; }
          .incentive-item { padding: 14px; gap: 10px; }
          .incentive-icon { font-size: 1.8rem; }
          .incentive-photo { width: 48px; height: 48px; }
          .progress-steps { margin-bottom: 24px; max-width: 100%; justify-content: center; }
          .promo-choice-cards {
            grid-template-columns: 1fr;
            gap: 24px;
          }
        }
      `}</style>
    </>
  )
}

export default function ProPage() {
  return (
    <Suspense fallback={
      <div className="promo-loading">
        <div className="spinner"></div>
        Loading...
      </div>
    }>
      <ProContent />
    </Suspense>
  )
}
