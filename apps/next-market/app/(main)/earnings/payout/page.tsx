'use client'

import { LoadingSpinner } from '../../../components/LoadingSpinner'
/**
 * Payout — Gift Cards, Donate, Cashout
 *
 * Includes:
 * - Venmo/PayPal verification flow (random micro-transaction)
 * - Fee-based payout minimums
 * - Auto-payout configuration (merged from old auto-redeem page)
 * - Sweep policy: 90 days inactivity OR balance > $500
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../../lib/useAuth'
import { formatUsd } from '../../../../lib/store'
import { createClient } from '../../../../lib/supabase'
import { trackClick, trackError } from '../../../../lib/analytics'
import styles from './page.module.css'

// ── Types ──
interface GiftCardProduct {
  brandName: string
  brandKey: string
  logoUrl: string
  cardImageUrl?: string
  category: string
  fixedDenominations: number[]
  minDenomination: number
  maxDenomination: number
  denominationType: string
  description?: string
}

interface CharityProject {
  id: string
  title: string
  organization: string
  summary: string
  theme: string
  imageUrl: string
  goal: number
  raised: number
}

interface PayoutStatus {
  handle: string | null
  handle_type: string | null
  verified: boolean
  verification_pending: boolean
  verification_sent_at: string | null
  verification_amount: number | null
  attempts: number
}

interface AutoPayConfig {
  enabled: boolean
  method: string
  threshold_usd: number
  cashout_payout_id: string | null
  gift_card_brand: string | null
  gift_card_amount_usd: number | null
  charity_project_id: string | null
  charity_project_name: string | null
}

type Tab = 'giftCards' | 'donate' | 'cashout'

const CHARITY_THEMES = ['All', 'Hunger', 'Environment', 'Education', 'Health']
const THRESHOLD_PRESETS = [25, 50, 100, 250]
const GIFT_CARD_MIN = 1.00
const MAX_LEDGER_BALANCE = 500.00

export default function PayoutPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const userId = user?.id
  const supabase = useMemo(() => createClient(), [])
  const detailsRef = useRef<HTMLDivElement>(null)
  const [selectedPayoutMode, setSelectedPayoutMode] = useState<'stripe' | 'manual' | 'auto'>('manual')



  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<Tab>('giftCards')

  // ── Balance ──
  const [availableUsd, setAvailableUsd] = useState(0)
  const [heldBalanceUsd, setHeldBalanceUsd] = useState(0)

  // ── Active methods ──
  const [activeMethods, setActiveMethods] = useState<{ method: string; is_active: boolean; instruments: { instrument: string; is_active: boolean }[] }[]>([])

  // ── Payout verification ──
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus | null>(null)
  const [verifyHandle, setVerifyHandle] = useState('')
  const [confirmVerifyHandle, setConfirmVerifyHandle] = useState('')
  const [verifyHandleType, setVerifyHandleType] = useState<'venmo' | 'paypal'>('venmo')
  const [verifyingHandle, setVerifyingHandle] = useState(false)
  const [verifyAmount, setVerifyAmount] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verifySuccess, setVerifySuccess] = useState(false)
  const [isChangingHandle, setIsChangingHandle] = useState(false)
  
  // ── Manual Cashout Double-Entry ──
  const [customHandleType, setCustomHandleType] = useState<'venmo'|'paypal'>('venmo')
  const [customHandle, setCustomHandle] = useState('')
  const [confirmCustomHandle, setConfirmCustomHandle] = useState('')

  // ── Gift Card state ──
  const [gcSearch, setGcSearch] = useState('')
  const [gcCategory, setGcCategory] = useState('All')
  const [catalogCards, setCatalogCards] = useState<GiftCardProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [selectedCard, setSelectedCard] = useState<GiftCardProduct | null>(null)
  const [gcAmount, setGcAmount] = useState<number | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [redemptionResult, setRedemptionResult] = useState<{
    brandName: string; amount: number; code?: string; url?: string; status?: string; redeemedAt: string
  } | null>(null)

  // ── Donate state ──
  const [charitySearch, setCharitySearch] = useState('')
  const [charityTheme, setCharityTheme] = useState('All')
  const [donationProjects, setDonationProjects] = useState<CharityProject[]>([])
  const [selectedCharity, setSelectedCharity] = useState<CharityProject | null>(null)
  const [donateAmount, setDonateAmount] = useState('')
  const [donating, setDonating] = useState(false)
  const [searchResults, setSearchResults] = useState<CharityProject[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [completedDonation, setCompletedDonation] = useState<{
    organizationName: string; projectTitle: string; theme: string; amount: number;
    donatedAt: string; receiptId?: string; receiptUrl?: string; status?: string
  } | null>(null)

  // ── Cashout state ──
  const [cashoutAmount, setCashoutAmount] = useState('')
  const [cashingOut, setCashingOut] = useState(false)
  const [cashoutResult, setCashoutResult] = useState<{ success: boolean; txnId?: string; status?: string } | null>(null)

  // ── Feature flag: Stripe Connect ──
  const stripeConnectEnabled = process.env.NEXT_PUBLIC_STRIPE_CONNECT_ENABLED === 'true'

  // ── Stripe Connect States ──
  const [stripeInfo, setStripeInfo] = useState<{ stripe_connect_id: string | null; stripe_onboarding_completed: boolean; stripe_connect_active: boolean } | null>(null)
  const [connectingStripe, setConnectingStripe] = useState(false)
  const [activatingStripe, setActivatingStripe] = useState(false)
  const [loadingStripeInfo, setLoadingStripeInfo] = useState(!stripeConnectEnabled ? false : true)
  const [failedTransfer, setFailedTransfer] = useState<{ id: string; amount: number; error: string } | null>(null)

  // ── Auto-payout state ──
  const [showAutoPay, setShowAutoPay] = useState(false)
  const [autoConfig, setAutoConfig] = useState<AutoPayConfig>({
    enabled: true, method: 'cashout', threshold_usd: 50,
    cashout_payout_id: null, gift_card_brand: null, gift_card_amount_usd: null,
    charity_project_id: null, charity_project_name: null,
  })
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const [customThreshold, setCustomThreshold] = useState('')

  // ── Error state ──
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // ── Fetch balance ──
  useEffect(() => {
    if (!userId) return
    supabase.rpc('get_transaction_summary', {}).then(({ data }: { data: any }) => {
      if (data) {
        setAvailableUsd(data.available_usd || 0)
        setHeldBalanceUsd(data.held_balance_usd || 0)
      }
    })
  }, [userId, supabase])

  // ── Fetch active methods ──
  useEffect(() => {
    supabase.rpc('get_active_redemption_providers').then(({ data }: { data: any }) => {
      if (data) setActiveMethods(data)
    })
  }, [supabase])

  // ── Fetch payout status ──
  useEffect(() => {
    if (!userId) return
    supabase.rpc('get_payout_status').then(({ data }: { data: any }) => {
      if (data) {
        setPayoutStatus(data)
        if (data.handle) {
          setVerifyHandle(data.handle)
          setVerifyHandleType(data.handle_type || 'venmo')
        }
      }
    })
  }, [userId, supabase])

  // ── Fetch Stripe Connect Info ──
  const fetchStripeInfo = useCallback(async () => {
    if (!userId || !stripeConnectEnabled) return
    setLoadingStripeInfo(true)
    try {
      const { data, error } = await supabase.rpc('get_profile_stripe_connect_info')
      if (!error && data && data.length > 0) {
        setStripeInfo(data[0])
      }
    } catch (err) {
      console.error('[PAYOUT] Error fetching stripe connect info:', err)
    } finally {
      setLoadingStripeInfo(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    fetchStripeInfo()
  }, [fetchStripeInfo])

  // ── Fetch Failed Stripe Transfers ──
  useEffect(() => {
    if (!userId || !stripeConnectEnabled) return
    supabase.from('user_settlements')
      .select('id, net_payout_usd, stripe_transfer_error, status')
      .eq('user_id', userId)
      .in('status', ['stripe_transfer_failed', 'wallet_fallback', 'stripe_transfer_reversed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data) {
          const isRestored = data.status === 'wallet_fallback' || data.status === 'stripe_transfer_reversed'
          setFailedTransfer({
            id: data.id,
            amount: data.net_payout_usd,
            error: isRestored
              ? `Funds restored to your wallet. Original error: ${data.stripe_transfer_error || 'Unknown'}`
              : data.stripe_transfer_error || 'Unknown error'
          })
        } else {
          setFailedTransfer(null)
        }
      })
  }, [userId, supabase])

  // ── Fetch auto-payout config ──
  useEffect(() => {
    if (!userId) return
    supabase.rpc('get_auto_redemption_config').then(({ data }: { data: any }) => {
      if (data) setAutoConfig(data)
    })
  }, [userId, supabase])

  // ── Sync payout mode on mount or data load ──
  useEffect(() => {
    if (stripeInfo) {
      if (stripeInfo.stripe_connect_active) {
        setSelectedPayoutMode('stripe')
      } else if (autoConfig.enabled) {
        setSelectedPayoutMode('auto')
      } else {
        setSelectedPayoutMode('manual')
      }
    }
  }, [stripeInfo, autoConfig.enabled])

  // ── Fetch gift cards ──
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('fetch-market-gift-cards')
        if (!error && data?.cards?.length > 0) setCatalogCards(data.cards)
      } catch (err) { console.warn('[PAYOUT] Catalog fetch failed:', err) }
      finally { setCatalogLoading(false) }
    })()
  }, [supabase])

  // ── Fetch donation projects ──
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('fetch-donation-projects')
        if (!error && data?.projects?.length > 0) setDonationProjects(data.projects)
      } catch (err) { console.warn('[DONATE] Fetch failed:', err) }
    })()
  }, [supabase])



  // ── Method availability ──
  const isMethodAvailable = useCallback((methodName: string) => {
    const m = activeMethods.find(m => m.method === methodName)
    if (!m?.is_active) return false
    if (m.instruments?.length > 0) return m.instruments.some(i => i.is_active)
    return true
  }, [activeMethods])

  const availableTabs = useMemo(() => {
    const tabs: { key: Tab; icon: string; label: string }[] = []
    if (availableUsd >= GIFT_CARD_MIN || isMethodAvailable('giftcards')) tabs.push({ key: 'giftCards', icon: '🎁', label: 'Gift Cards' })
    if (isMethodAvailable('charity')) tabs.push({ key: 'donate', icon: '❤️', label: 'Donate' })
    if (isMethodAvailable('cashout') || true) tabs.push({ key: 'cashout', icon: '💸', label: 'Venmo / PayPal' })
    if (tabs.length === 0) {
      tabs.push({ key: 'giftCards', icon: '🎁', label: 'Gift Cards' })
      tabs.push({ key: 'donate', icon: '❤️', label: 'Donate' })
      tabs.push({ key: 'cashout', icon: '💸', label: 'Venmo / PayPal' })
    }
    return tabs
  }, [isMethodAvailable, availableUsd])

  // ── Derived data ──
  const dynamicCategories = useMemo(() => {
    if (catalogCards.length === 0) return ['All']
    const cats = new Set(catalogCards.map(c => c.category))
    return ['All', ...Array.from(cats).sort()]
  }, [catalogCards])

  const filteredCards = useMemo(() => {
    let cards = catalogCards
    if (gcCategory !== 'All') cards = cards.filter(c => c.category === gcCategory)
    if (gcSearch) cards = cards.filter(c => c.brandName.toLowerCase().includes(gcSearch.toLowerCase()))
    return cards
  }, [gcSearch, gcCategory, catalogCards])

  const filteredCharities = useMemo(() => {
    const src = searchResults || donationProjects
    let charities = src
    if (charityTheme !== 'All') charities = charities.filter(c => c.theme === charityTheme)
    if (!searchResults && charitySearch) {
      charities = charities.filter(c => c.title.toLowerCase().includes(charitySearch.toLowerCase()))
    }
    return charities
  }, [charitySearch, charityTheme, donationProjects, searchResults])

  const maxUsd = availableUsd

  // ──────────────────────────────────────────────────────────
  // Payout Destination Setup Handlers
  // ──────────────────────────────────────────────────────────
  const handleSaveVerifiedDestination = useCallback(async () => {
    if (!verifyHandle.trim() || verifyHandle !== confirmVerifyHandle) {
      setVerifyError('Handles must match exactly.')
      return
    }
    setVerifyError(null)
    setVerifyingHandle(true)
    try {
      // 1. Immediately verify the user using the double-entered handle
      const { data, error } = await supabase.rpc('confirm_manual_payout_verification', {
        p_handle: verifyHandle.trim(),
        p_handle_type: verifyHandleType,
      })
      if (error) throw error
      if (data?.success && data?.verified) {
        setVerifySuccess(true)
        setPayoutStatus(prev => prev ? ({ ...prev, verified: true, verification_pending: false, handle: verifyHandle.trim(), handle_type: verifyHandleType }) : null)
        setIsChangingHandle(false)
        setSuccessMsg('✅ Account connected! You can now use auto-withdrawals.')
        setTimeout(() => { setSuccessMsg(null); setVerifySuccess(false) }, 5000)
      } else {
        setVerifyError(data?.error || 'Verification failed')
      }
    } catch (err: any) {
      setVerifyError(err.message || 'Setup failed')
    } finally { setVerifyingHandle(false) }
  }, [verifyHandle, confirmVerifyHandle, verifyHandleType, supabase])

  // ──────────────────────────────────────────────────────────
  // Payout handlers
  // ──────────────────────────────────────────────────────────
  const handleCharitySearch = useCallback(async () => {
    if (!charitySearch || charitySearch.length < 2) { setSearchResults(null); return }
    setIsSearching(true)
    try {
      const { data, error } = await supabase.functions.invoke('fetch-donation-projects', {
        body: { q: charitySearch },
      })
      if (!error && data?.projects) setSearchResults(data.projects)
    } catch (err) { console.warn('[DONATE] Search failed:', err) }
    finally { setIsSearching(false) }
  }, [charitySearch, supabase])

  const handleRedeemGiftCard = useCallback(async () => {
    if (!selectedCard || !gcAmount) return
    if (gcAmount < GIFT_CARD_MIN) { setError(`Minimum gift card amount is ${formatUsd(GIFT_CARD_MIN)}`); return }
    trackClick('redeem_gift_card', { brand: selectedCard.brandName, amount: gcAmount })
    setError(null)
    setRedeeming(true)
    try {
      const { data, error } = await supabase.functions.invoke('market-purchase-gift-card', {
        body: { brandName: selectedCard.brandName, faceValueCents: Math.round(gcAmount * 100), pointsCost: Math.round(gcAmount * 100) },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setRedemptionResult({
        brandName: selectedCard.brandName, amount: gcAmount,
        code: data?.cardCode, url: data?.cardUrl, status: data?.status || 'pending',
        redeemedAt: new Date().toISOString(),
      })
      setAvailableUsd(prev => Math.max(0, prev - gcAmount))
      setSelectedCard(null)
    } catch (err: any) {
      trackError('gift_card_redeem_failed', { error: err.message })
      setError(err.message || 'Gift card purchase failed')
    } finally { setRedeeming(false) }
  }, [selectedCard, gcAmount, supabase])

  const handleDonate = useCallback(async () => {
    if (!selectedCharity || !donateAmount) return
    trackClick('donate', { project: selectedCharity.title, amount: parseFloat(donateAmount) })
    setError(null)
    setDonating(true)
    const usdAmt = parseFloat(donateAmount) || 0
    try {
      const { data, error } = await supabase.functions.invoke('market-donate-earnings', {
        body: {
          projectId: selectedCharity.id, projectTitle: selectedCharity.title,
          organizationName: selectedCharity.organization, theme: selectedCharity.theme,
          pointsAmount: Math.round(usdAmt * 100),
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setAvailableUsd(prev => Math.max(0, prev - usdAmt))
      setCompletedDonation({
        organizationName: selectedCharity.organization, projectTitle: selectedCharity.title,
        theme: selectedCharity.theme, amount: Math.round(usdAmt * 100),
        donatedAt: new Date().toISOString(), receiptId: data.receiptNumber,
        receiptUrl: data.receiptUrl, status: data.status || 'queued',
      })
      setSelectedCharity(null)
      setDonateAmount('')
    } catch (err: any) {
      trackError('donate_failed', { error: err.message })
      setError(err.message || 'Donation failed')
    } finally { setDonating(false) }
  }, [selectedCharity, donateAmount, supabase])

  const handleCashout = useCallback(async () => {
    if (!cashoutAmount) return
    const usdAmt = parseFloat(cashoutAmount) || 0
    
    let targetHandle = payoutStatus?.handle
    let needsGlobalVerification = false
    if (!payoutStatus?.verified) {
       if (!customHandle.trim() || customHandle !== confirmCustomHandle) {
         setError('Handles must match exactly before manual cashout.')
         return
       }
       targetHandle = customHandle.trim()
       needsGlobalVerification = true
    }
    if (!targetHandle) return

    trackClick('cashout', { amount: usdAmt })
    setError(null)
    setCashingOut(true)
    try {
      if (needsGlobalVerification) {
        await supabase.rpc('confirm_manual_payout_verification', { p_handle: targetHandle, p_handle_type: customHandleType || 'venmo' })
        setPayoutStatus(prev => prev ? ({ ...prev, verified: true, handle: targetHandle, handle_type: customHandleType || 'venmo' }) : null)
      }

      const { data, error } = await supabase.functions.invoke('market-cashout-paypal', {
        body: { pointsToRedeem: Math.round(usdAmt * 100), payoutId: targetHandle },
      })
      if (error) throw error
      if (!data?.success && data?.error) throw new Error(data.error)
      setAvailableUsd(prev => Math.max(0, prev - usdAmt))
      setCashoutResult({ success: true, txnId: data.batch_id || data.transactionId, status: data.status || 'completed' })
    } catch (err: any) {
      trackError('cashout_failed', { error: err.message })
      setError(err.message || 'Cashout failed')
    } finally { setCashingOut(false) }
  }, [payoutStatus, cashoutAmount, customHandle, confirmCustomHandle, supabase])



  // ── Auto-payout save ──
  const handleAutoSave = useCallback(async () => {
    trackClick('save_auto_payout', { method: autoConfig.method, threshold: autoConfig.threshold_usd })
    setError(null)
    setAutoSaving(true)
    setAutoSaved(false)
    try {
      // Deactivate Stripe Connect direct payouts so wallet auto-sweeps take priority
      await supabase.rpc('set_stripe_connect_active', { p_active: false })
      setStripeInfo(prev => prev ? ({ ...prev, stripe_connect_active: false }) : null)

      const { data, error } = await supabase.rpc('save_auto_redemption_config', {
        p_enabled: autoConfig.enabled,
        p_method: autoConfig.method,
        p_threshold_usd: autoConfig.threshold_usd,
        p_cashout_payout_id: payoutStatus?.handle || autoConfig.cashout_payout_id,
        p_gift_card_brand: autoConfig.gift_card_brand,
        p_gift_card_amount_usd: autoConfig.gift_card_amount_usd,
        p_charity_project_id: autoConfig.charity_project_id,
        p_charity_project_name: autoConfig.charity_project_name,
      })
      if (data?.error) { setError(data.error); return }
      if (error) throw error
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally { setAutoSaving(false) }
  }, [autoConfig, payoutStatus, supabase])

  // ── Stripe Connect handlers ──
  const handleConnectStripe = useCallback(async () => {
    trackClick('connect_stripe_init')
    setError(null)
    setConnectingStripe(true)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-onboard')
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (data?.url) {
        window.location.href = data.url
      } else {
        throw new Error('Failed to get onboarding URL from Stripe.')
      }
    } catch (err: any) {
      trackError('stripe_connect_failed', { error: err.message })
      setError(err.message || 'Failed to initiate Stripe connection.')
    } finally {
      setConnectingStripe(false)
    }
  }, [supabase])

  const handlePayoutModeSelect = useCallback((mode: 'stripe' | 'manual' | 'auto') => {
    trackClick('payout_mode_select', { mode })
    setError(null)
    setSuccessMsg(null)
    setSelectedPayoutMode(mode)
  }, [])

  const handleActivateStripeDirect = useCallback(async () => {
    trackClick('activate_stripe_direct')
    setError(null)
    setSuccessMsg(null)
    setActivatingStripe(true)
    try {
      const { error: activeErr } = await supabase.rpc('set_stripe_connect_active', { p_active: true })
      if (activeErr) throw activeErr
      
      const { error: autoErr } = await supabase.rpc('save_auto_redemption_config', {
        p_enabled: false,
        p_method: autoConfig.method,
        p_threshold_usd: autoConfig.threshold_usd,
        p_cashout_payout_id: payoutStatus?.handle || autoConfig.cashout_payout_id,
        p_gift_card_brand: autoConfig.gift_card_brand,
        p_gift_card_amount_usd: autoConfig.gift_card_amount_usd,
        p_charity_project_id: autoConfig.charity_project_id,
        p_charity_project_name: autoConfig.charity_project_name,
      })
      if (autoErr) throw autoErr
      
      setAutoConfig(prev => ({ ...prev, enabled: false }))
      setStripeInfo(prev => prev ? ({ ...prev, stripe_connect_active: true }) : null)
      setSuccessMsg('✅ Stripe Direct Payouts activated successfully!')
    } catch (err: any) {
      setError(err.message || 'Failed to activate Stripe Direct Payouts.')
    } finally {
      setActivatingStripe(false)
    }
  }, [supabase, autoConfig, payoutStatus])

  // Auto-dismiss results
  useEffect(() => { if (redemptionResult) { const t = setTimeout(() => setRedemptionResult(null), 8000); return () => clearTimeout(t) } }, [redemptionResult])
  useEffect(() => { if (completedDonation) { const t = setTimeout(() => setCompletedDonation(null), 8000); return () => clearTimeout(t) } }, [completedDonation])
  useEffect(() => { if (cashoutResult) { const t = setTimeout(() => setCashoutResult(null), 8000); return () => clearTimeout(t) } }, [cashoutResult])

  // ── Auth guards ──
  if (authLoading) return <LoadingSpinner />
  if (!isAuthenticated) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><h2>Sign in to manage payouts</h2><Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link></div>
  }

  const giftCardDisabled = availableUsd < GIFT_CARD_MIN

  return (
    <div className="container-sm">
      <Link href="/earnings" className={styles.backLink}>← Back to Earnings</Link>

      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Payout</h1>
        <div className={styles.balanceBadge}>
          <span className={styles.balanceLabel}>Available</span>
          <span className={styles.balanceValue}>{formatUsd(availableUsd)}</span>
        </div>
        {heldBalanceUsd > 0 && (
          <div className={styles.balanceBadge} style={{ background: 'var(--amber-50)', borderColor: 'var(--amber-200)', marginLeft: 8 }}>
            <span className={styles.balanceLabel} style={{ color: 'var(--amber-600)' }}>Held for Purchases</span>
            <span className={styles.balanceValue} style={{ color: 'var(--amber-700)' }}>{formatUsd(heldBalanceUsd)}</span>
          </div>
        )}
      </div>

      {/* $500 max balance warning */}
      {availableUsd >= 400 && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          background: availableUsd >= MAX_LEDGER_BALANCE ? 'var(--red-50)' : 'var(--amber-50)',
          border: `1px solid ${availableUsd >= MAX_LEDGER_BALANCE ? 'var(--red-200)' : 'var(--amber-200)'}`,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: availableUsd >= MAX_LEDGER_BALANCE ? 'var(--red-700)' : 'var(--amber-700)', lineHeight: 1.5 }}>
            {availableUsd >= MAX_LEDGER_BALANCE
              ? '🚨 Your balance exceeds $500. Per our Terms of Use, an automatic payout will be triggered to comply with AML guidelines.'
              : '⚠️ Your balance is approaching the $500 maximum. Per our Terms, balances exceeding $500 trigger an automatic payout.'}
          </p>
        </div>
      )}

      {/* Error / Success */}
      {error && <div className={styles.alertError}>❌ {error} <button onClick={() => setError(null)} className={styles.alertClose}>✕</button></div>}
      {successMsg && <div className={styles.alertSuccess}>✅ {successMsg}</div>}

      {/* failed transfer warning banner */}
      {failedTransfer && (
        <div className={styles.warningBanner} style={
          failedTransfer.error.startsWith('Funds restored')
            ? { borderColor: 'var(--green-300)', background: 'var(--green-50)' }
            : undefined
        }>
          <span className={styles.warningIcon}>{failedTransfer.error.startsWith('Funds restored') ? 'ℹ️' : '⚠️'}</span>
          <div className={styles.warningContent}>
            <div className={styles.warningTitle}>
              {failedTransfer.error.startsWith('Funds restored') ? 'Direct Transfer Recovered' : 'Direct Transfer Failed'}
            </div>
            <div className={styles.warningText}>
              {failedTransfer.error.startsWith('Funds restored')
                ? <>Your last direct deposit of {formatUsd(failedTransfer.amount)} couldn&apos;t reach your bank. The funds have been restored to your wallet — you can withdraw via Gift Card, Venmo, or PayPal below.</>
                : <>We couldn&apos;t transfer your last payout of {formatUsd(failedTransfer.amount)}. Stripe Error: {failedTransfer.error}.</>
              }
            </div>
            {!failedTransfer.error.startsWith('Funds restored') && (
              <button className={styles.warningFixBtn} onClick={handleConnectStripe} disabled={connectingStripe}>
                {connectingStripe ? 'Opening Stripe...' : 'Fix in Stripe Onboarding'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Premium Segmented Control Switcher */}
      <div className={styles.segmentedControl}>
        {stripeConnectEnabled && (
          <button
            className={`${styles.segmentedBtn} ${selectedPayoutMode === 'stripe' ? styles.segmentedBtnActive : ''}`}
            onClick={() => handlePayoutModeSelect('stripe')}
          >
            💳 Direct to Bank {stripeInfo?.stripe_connect_active && stripeInfo?.stripe_onboarding_completed && '✓'}
          </button>
        )}
        <button
          className={`${styles.segmentedBtn} ${selectedPayoutMode === 'auto' ? styles.segmentedBtnActive : ''}`}
          onClick={() => handlePayoutModeSelect('auto')}
        >
          ⚡ Auto-Sweep Wallet
        </button>
        <button
          className={`${styles.segmentedBtn} ${selectedPayoutMode === 'manual' ? styles.segmentedBtnActive : ''}`}
          onClick={() => handlePayoutModeSelect('manual')}
        >
          🖐️ Withdraw Manually
        </button>
      </div>

      <div ref={detailsRef} style={{ scrollMarginTop: '20px' }}>
        {stripeConnectEnabled && selectedPayoutMode === 'stripe' ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 20 }}>
            <div className={styles.methodExplanation}>
              Send net earnings directly to your bank account via Stripe Connect at settlement. Future sales bypass your virtual wallet entirely and deposit directly via ACH.
            </div>

            {loadingStripeInfo ? (
              <div className={styles.emptyState}>
                <span className={styles.searchSpinner}>⏳</span>
                <p>Loading Stripe Connect information...</p>
              </div>
            ) : stripeInfo?.stripe_onboarding_completed ? (
              <div className={`${styles.stripeConnectCard} ${stripeInfo.stripe_connect_active ? styles.stripeLinked : styles.stripeUnlinked}`} style={{ margin: 0 }}>
                <div className={styles.stripeHeader}>
                  <div className={styles.stripeBrand}>
                    <span className={styles.stripeLogo}>stripe</span>
                    <span className={styles.stripeTitle}>
                      {stripeInfo.stripe_connect_active ? 'Direct Payouts Active' : 'Stripe Account Linked'}
                    </span>
                  </div>
                  <span className={`${styles.stripeStatusBadge} ${stripeInfo.stripe_connect_active ? styles.stripeStatusLinked : styles.stripeStatusUnlinked}`}>
                    {stripeInfo.stripe_connect_active ? '✓ Connected & Active' : 'Inactive'}
                  </span>
                </div>
                <p className={styles.stripeDesc}>
                  Your Standard Stripe account <strong>({stripeInfo.stripe_connect_id})</strong> is linked.
                  {stripeInfo.stripe_connect_active
                    ? ' Payouts from future settlements will bypass your virtual wallet and deposit directly to your bank account via ACH.'
                    : ' Your bank details are verified. Activate Direct Payouts below to automatically route future settlements directly to your bank account instead of your virtual wallet.'
                  }
                </p>
                <div className={styles.stripeActions}>
                  {stripeInfo.stripe_connect_active ? (
                    <a
                      href="https://dashboard.stripe.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.stripeDashLink}
                    >
                      View Stripe Dashboard ↗
                    </a>
                  ) : (
                    <button className="btn btn-primary" onClick={handleActivateStripeDirect} disabled={activatingStripe}>
                      {activatingStripe ? 'Activating...' : 'Activate Stripe Direct Payouts'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className={`${styles.stripeConnectCard} ${styles.stripeUnlinked}`} style={{ margin: 0 }}>
                <div className={styles.stripeHeader}>
                  <div className={styles.stripeBrand}>
                    <span className={styles.stripeLogo}>stripe</span>
                    <span className={styles.stripeTitle}>Direct Payouts via Stripe Connect</span>
                  </div>
                  <span className={`${styles.stripeStatusBadge} ${styles.stripeStatusUnlinked}`}>
                    Not Connected
                  </span>
                </div>
                <p className={styles.stripeDesc}>
                  Connect your bank account to receive direct deposits from every settlement. Set up your Stripe Standard account in less than 3 minutes to start receiving fast, automated ACH payouts.
                </p>
                <div className={styles.stripeActions}>
                  <button className="btn btn-primary" onClick={handleConnectStripe} disabled={connectingStripe}>
                    {connectingStripe ? 'Connecting to Stripe...' : 'Connect Stripe'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : selectedPayoutMode === 'auto' ? (
          /* ═══ AUTO-PAYOUT CONFIG ═══ */
          <div className={styles.tabContent} style={{ border: '1px solid var(--green-200)', borderRadius: 12, padding: 20, background: 'var(--white)' }}>
            <div className={styles.methodExplanation}>
              Automatically withdraw your virtual wallet balance as soon as a custom threshold is met. Choose your trigger limit and automatic destination below.
            </div>

            {stripeInfo?.stripe_connect_active && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--amber-50)', border: '1px solid var(--amber-200)', marginBottom: 16, fontSize: 12, color: 'var(--amber-700)', lineHeight: 1.5 }}>
                ⚠️ <strong>Stripe Direct Payouts are currently active.</strong> Activating automatic wallet withdrawals will route your future settlements to your virtual wallet and automatically deactivate your Stripe Direct Payouts.
              </div>
            )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Payout Method</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { key: 'cashout', icon: '💸', label: 'Venmo / PayPal', disabled: false },
                { key: 'giftcards', icon: '🎁', label: 'Gift Card', disabled: false },
                { key: 'charity', icon: '❤️', label: 'Donate', disabled: false },
              ].map(m => (
                <button key={m.key}
                  onClick={() => !m.disabled && setAutoConfig(prev => ({ ...prev, method: m.key }))}
                  disabled={m.disabled}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 10, border: `2px solid ${autoConfig.method === m.key ? 'var(--green-500)' : 'var(--gray-200)'}`,
                    background: autoConfig.method === m.key ? 'var(--green-50)' : 'var(--white)',
                    cursor: m.disabled ? 'not-allowed' : 'pointer', opacity: m.disabled ? 0.5 : 1,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 12,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
            {autoConfig.method === 'cashout' && (payoutStatus?.verified && !isChangingHandle) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 8, marginTop: 12 }}>
                <span style={{ fontSize: 14 }}>✅ <strong>{payoutStatus.handle}</strong> ({payoutStatus.handle_type === 'venmo' ? 'Venmo' : 'PayPal'})</span>
                <button onClick={() => setIsChangingHandle(true)}
                  style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-500)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Change</button>
              </div>
            )}
            {autoConfig.method === 'cashout' && (!payoutStatus?.verified || isChangingHandle) && (
              <div style={{ marginTop: 12, padding: 16, background: 'var(--gray-50)', borderRadius: 10, border: '1px solid var(--gray-200)' }}>
                 <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>Setup Auto-Payout Destination</p>
                 <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {(['venmo', 'paypal'] as const).map(t => (
                      <button key={t} onClick={() => setVerifyHandleType(t)}
                        style={{
                          flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: `2px solid ${verifyHandleType === t ? 'var(--green-500)' : 'var(--gray-200)'}`,
                          background: verifyHandleType === t ? 'var(--green-50)' : 'var(--white)',
                        }}
                      >{t === 'venmo' ? '📱 Venmo' : '💳 PayPal'}</button>
                    ))}
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <input className="input" value={verifyHandle}
                      onChange={e => setVerifyHandle(e.target.value)}
                      placeholder={verifyHandleType === 'venmo' ? 'Venmo phone (+15555551234)' : 'PayPal email'} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <input className="input" value={confirmVerifyHandle}
                      onChange={e => setConfirmVerifyHandle(e.target.value)}
                      placeholder={`Confirm ${verifyHandleType === 'venmo' ? 'Venmo phone' : 'PayPal email'}`} />
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%' }}
                    onClick={handleSaveVerifiedDestination}
                    disabled={!verifyHandle.trim() || verifyHandle !== confirmVerifyHandle || verifyingHandle}
                  >{verifyingHandle ? 'Saving...' : 'Save Auto-Payout Destination'}</button>
                  {verifyError && <p style={{ fontSize: 12, color: 'var(--red-500)', marginTop: 6 }}>❌ {verifyError}</p>}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Payout Threshold</label>
            <p style={{ fontSize: 11, color: 'var(--gray-500)', margin: '0 0 8px' }}>When your balance reaches this amount, your full balance is automatically paid out. Balances exceeding $500 will automatically trigger a sweep payout.</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {THRESHOLD_PRESETS.map(t => (
                <button key={t}
                  onClick={() => setAutoConfig(prev => ({ ...prev, threshold_usd: t }))}
                  style={{
                    padding: '6px 14px', borderRadius: 8,
                    border: `1.5px solid ${autoConfig.threshold_usd === t ? 'var(--green-500)' : 'var(--gray-200)'}`,
                    background: autoConfig.threshold_usd === t ? 'var(--green-50)' : 'var(--white)',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >{formatUsd(t)}</button>
              ))}
              <input type="number" placeholder="Custom" min={autoConfig.method === 'giftcards' ? '1' : '5'} step="5"
                style={{ width: 80, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--gray-200)', fontSize: 13 }}
                value={customThreshold}
                onChange={e => { setCustomThreshold(e.target.value); if (e.target.value) setAutoConfig(prev => ({ ...prev, threshold_usd: parseFloat(e.target.value) })) }}
              />
            </div>
            {autoConfig.method === 'giftcards' && <p style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>Minimum $1.00 for gift cards • No payout fee</p>}
          </div>

          {autoConfig.method === 'giftcards' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Preferred Gift Card</label>
              {autoConfig.gift_card_brand && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14 }}>✅ <strong>{autoConfig.gift_card_brand}</strong></span>
                  <button onClick={() => setAutoConfig(prev => ({ ...prev, gift_card_brand: '' }))}
                    style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-400)', background: 'none', border: 'none', cursor: 'pointer' }}>Change</button>
                </div>
              )}
              <div className={styles.searchBar} style={{ marginBottom: 8 }}>
                <span className={styles.searchIcon}>🔍</span>
                <input className={styles.searchInput} placeholder="Search gift cards..." value={gcSearch} onChange={e => setGcSearch(e.target.value)} />
              </div>
              <div className={styles.filterRow} style={{ marginBottom: 8 }}>
                {dynamicCategories.map(c => (
                  <button key={c} onClick={() => setGcCategory(c)}
                    className={`${styles.filterBtn} ${gcCategory === c ? styles.filterBtnActive : ''}`}
                  >{c}</button>
                ))}
              </div>
              {catalogLoading ? (
                <div className={styles.emptyState}><p>Loading gift card catalog...</p></div>
              ) : filteredCards.length === 0 ? (
                <div className={styles.emptyState}><span className={styles.emptyIcon}>🎁</span><p>No gift cards found</p></div>
              ) : (
                <div className={styles.cardGrid} style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {filteredCards.map(card => (
                    <button key={card.brandKey} className={styles.gcCard}
                      onClick={() => setAutoConfig(prev => ({ ...prev, gift_card_brand: card.brandName }))}
                      style={autoConfig.gift_card_brand === card.brandName ? { border: '2px solid var(--green-500)', background: 'var(--green-50)' } : undefined}
                    >
                      {card.logoUrl && <img src={card.logoUrl} alt={card.brandName} className={styles.gcCardImg} />}
                      <span className={styles.gcCardName}>{card.brandName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {autoConfig.method === 'charity' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Preferred Charity</label>
              {autoConfig.charity_project_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14 }}>✅ <strong>{autoConfig.charity_project_name}</strong></span>
                  <button onClick={() => setAutoConfig(prev => ({ ...prev, charity_project_name: '' }))}
                    style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-400)', background: 'none', border: 'none', cursor: 'pointer' }}>Change</button>
                </div>
              )}
              <div className={styles.searchBar} style={{ marginBottom: 8 }}>
                <span className={styles.searchIcon}>🔍</span>
                <input className={styles.searchInput} placeholder="Search charities (press Enter)..." value={charitySearch}
                  onChange={e => { setCharitySearch(e.target.value); if (!e.target.value) setSearchResults(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleCharitySearch()}
                />
                {isSearching && <span className={styles.searchSpinner}>⏳</span>}
              </div>
              <div className={styles.filterRow} style={{ marginBottom: 8 }}>
                {CHARITY_THEMES.map(th => (
                  <button key={th} onClick={() => setCharityTheme(th)}
                    className={`${styles.filterBtn} ${charityTheme === th ? styles.filterBtnActive : ''}`}
                  >{th}</button>
                ))}
              </div>
              {filteredCharities.length === 0 ? (
                <div className={styles.emptyState}><span className={styles.emptyIcon}>❤️</span><p>No charities found</p></div>
              ) : (
                <div className={styles.charityList} style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {filteredCharities.map(charity => {
                    const progress = Math.min(charity.raised / charity.goal, 1)
                    return (
                      <button key={charity.id} className={styles.charityCard}
                        onClick={() => setAutoConfig(prev => ({ ...prev, charity_project_id: String(charity.id), charity_project_name: charity.title }))}
                        style={autoConfig.charity_project_name === charity.title ? { border: '2px solid var(--green-500)', background: 'var(--green-50)' } : undefined}
                      >
                        <img src={charity.imageUrl} alt={charity.title} className={styles.charityImg} />
                        <div className={styles.charityInfo}>
                          <span className={styles.charityTitle}>{charity.title}</span>
                          <span className={styles.charityOrg}>{charity.organization}</span>
                          <div className={styles.charityProgress}>
                            <div className={styles.charityProgressFill} style={{ width: `${progress * 100}%` }} />
                          </div>
                          <span className={styles.charityStats}>${charity.raised.toLocaleString()} / ${charity.goal.toLocaleString()}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <button className="btn btn-primary" style={{ width: '100%' }}
            onClick={handleAutoSave} disabled={autoSaving || activatingStripe || (autoConfig.method === 'charity' && !autoConfig.charity_project_id) || (autoConfig.method === 'giftcards' && !autoConfig.gift_card_brand) || (autoConfig.method === 'cashout' && (!payoutStatus?.verified || isChangingHandle))}
          >{autoSaving ? 'Saving...' : autoSaved ? '✅ Saved!' : 'Save Auto-Payout Settings'}</button>
        </div>
        ) : (
          <div>
            <div className={styles.methodExplanation}>
              Keep your earnings in your virtual wallet and manually cash out via Venmo, PayPal, or Gift Cards whenever you choose.
            </div>

            {stripeInfo?.stripe_connect_active && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--green-50)', border: '1px solid var(--green-200)', marginBottom: 16, fontSize: 12, color: 'var(--green-700)', lineHeight: 1.5 }}>
                ℹ️ <strong>Stripe Direct Payouts are currently active.</strong> Future sales settlements will bypass your virtual wallet and deposit directly to your bank. Existing wallet funds can be withdrawn below.
              </div>
            )}

            {/* ═══ MANUAL PAYOUT TABS ═══ */}
            <div className={styles.tabGrid}>
        {availableTabs.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setSelectedCard(null); setSelectedCharity(null); setError(null) }}
            className={`${styles.tabBtn} ${activeTab === t.key ? styles.tabBtnActive : ''}`}
          >
            <span className={styles.tabIcon}>{t.icon}</span>
            <span className={styles.tabLabel}>{t.label}</span>
            {t.key === 'giftCards' && giftCardDisabled && <span style={{ fontSize: 9, color: 'var(--red-500)' }}>Min ${GIFT_CARD_MIN}</span>}
          </button>
        ))}
      </div>

      {/* ── Gift Cards Tab ── */}
      {activeTab === 'giftCards' && (
        <div className={styles.tabContent}>
          {giftCardDisabled && (
            <div className={styles.warningBox}>
              ⚠️ Gift cards require a minimum balance of {formatUsd(GIFT_CARD_MIN)}. Your balance: {availableUsd > 0 ? formatUsd(availableUsd) : 'free'}
            </div>
          )}

          {redemptionResult && (
            <div className={styles.resultCard} style={redemptionResult.status === 'queued' ? { borderColor: 'var(--amber-300)', background: 'var(--amber-50)' } : undefined}>
              <div className={styles.resultIcon}>{redemptionResult.status === 'queued' ? '⏳' : '🎉'}</div>
              <h3>{redemptionResult.status === 'completed' ? 'Gift Card Ready!' : redemptionResult.status === 'queued' ? 'Queued for Processing' : 'Processing...'}</h3>
              <p className={styles.resultBrand}>{redemptionResult.brandName} — {formatUsd(redemptionResult.amount)}</p>
              {redemptionResult.status === 'queued' && (
                <p style={{ fontSize: 13, color: 'var(--amber-700)', marginTop: 8, lineHeight: 1.5 }}>
                  Your payout request will be processed at noon of the next business day.
                </p>
              )}
              {redemptionResult.url && (
                <a href={redemptionResult.url} target="_blank" rel="noopener" className="btn btn-primary" style={{ marginTop: 12 }}>🎁 Use Gift Card</a>
              )}
              {redemptionResult.code && <p className={styles.resultCode}>Code: <strong>{redemptionResult.code}</strong></p>}
            </div>
          )}

          {selectedCard ? (
            <div className={styles.selectionCard}>
              <button className={styles.backBtn} onClick={() => setSelectedCard(null)}>← Browse Cards</button>
              <div className={styles.selectionHeader}>
                {selectedCard.logoUrl && <img src={selectedCard.logoUrl} alt={selectedCard.brandName} className={styles.selectionImg} />}
                <h3>{selectedCard.brandName}</h3>
              </div>
              <div className={styles.amountGrid}>
                {selectedCard.denominationType === 'fixed' && selectedCard.fixedDenominations.length > 0 ? (
                  selectedCard.fixedDenominations.filter(d => d <= availableUsd).map(d => (
                    <button key={d} onClick={() => setGcAmount(d)}
                      className={`${styles.amountBtn} ${gcAmount === d ? styles.amountBtnActive : ''}`}
                    >{formatUsd(d)}</button>
                  ))
                ) : (
                  /* Range denomination — show preset amounts + custom input */
                  <>
                    {[5, 10, 15, 25, 50].filter(d => d >= selectedCard.minDenomination && d <= Math.min(selectedCard.maxDenomination, availableUsd)).map(d => (
                      <button key={d} onClick={() => setGcAmount(d)}
                        className={`${styles.amountBtn} ${gcAmount === d ? styles.amountBtnActive : ''}`}
                      >{formatUsd(d)}</button>
                    ))}
                  </>
                )}
                {selectedCard.denominationType !== 'fixed' && (
                  <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                    <div className="form-group">
                      <label className="label" style={{ fontSize: 12 }}>Custom Amount ({formatUsd(selectedCard.minDenomination)} – {formatUsd(Math.min(selectedCard.maxDenomination, availableUsd))})</label>
                      <input className="input" type="number"
                        min={selectedCard.minDenomination} max={Math.min(selectedCard.maxDenomination, availableUsd)}
                        step="0.01" placeholder={`Enter amount`}
                        value={gcAmount && ![5, 10, 15, 25, 50].includes(gcAmount) ? gcAmount : ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value)
                          if (!isNaN(val)) setGcAmount(val)
                          else setGcAmount(null)
                        }}
                      />
                    </div>
                  </div>
                )}
                {selectedCard.minDenomination > availableUsd && (
                  <p style={{ fontSize: 13, color: 'var(--red-500)', padding: 12 }}>
                    Balance too low for this card. Min: {formatUsd(selectedCard.minDenomination)}
                  </p>
                )}
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 16 }}
                onClick={handleRedeemGiftCard}
                disabled={!gcAmount || gcAmount > availableUsd || redeeming}
              >{redeeming ? 'Processing...' : gcAmount ? `Get ${formatUsd(gcAmount)} Gift Card` : 'Select Amount'}</button>
            </div>
          ) : (
            <>
              <div className={styles.searchBar}>
                <span className={styles.searchIcon}>🔍</span>
                <input className={styles.searchInput} placeholder="Search gift cards..." value={gcSearch} onChange={e => setGcSearch(e.target.value)} />
              </div>
              <div className={styles.filterRow}>
                {dynamicCategories.map(c => (
                  <button key={c} onClick={() => setGcCategory(c)}
                    className={`${styles.filterBtn} ${gcCategory === c ? styles.filterBtnActive : ''}`}
                  >{c}</button>
                ))}
              </div>
              {catalogLoading ? (
                <div className={styles.emptyState}><p>Loading gift card catalog...</p></div>
              ) : filteredCards.length === 0 ? (
                <div className={styles.emptyState}><span className={styles.emptyIcon}>🎁</span><p>No gift cards found</p></div>
              ) : (
                <div className={styles.cardGrid}>
                  {filteredCards.map(card => (
                    <button key={card.brandKey} className={styles.gcCard} onClick={() => { setSelectedCard(card); setGcAmount(null) }}
                      disabled={giftCardDisabled}>
                      {card.logoUrl && <img src={card.logoUrl} alt={card.brandName} className={styles.gcCardImg} />}
                      <span className={styles.gcCardName}>{card.brandName}</span>
                      <span className={styles.gcCardRange}>
                        {card.denominationType === 'fixed' && card.fixedDenominations.length > 1
                          ? `${formatUsd(card.minDenomination)} – ${formatUsd(card.maxDenomination)}`
                          : card.denominationType === 'range'
                            ? `${formatUsd(card.minDenomination)} – ${formatUsd(card.maxDenomination)}`
                            : formatUsd(card.minDenomination)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Donate Tab ── */}
      {activeTab === 'donate' && (
        <div className={styles.tabContent}>
          {completedDonation && (
            <div className={styles.resultCard} style={completedDonation.status === 'queued' ? { borderColor: 'var(--amber-300)', background: 'var(--amber-50)' } : undefined}>
              <div className={styles.resultIcon}>{completedDonation.status === 'queued' ? '⏳' : '💚'}</div>
              <h3>{completedDonation.status === 'queued' ? 'Donation Queued' : 'Thank You!'}</h3>
              <p>{formatUsd(completedDonation.amount / 100)} donated to {completedDonation.organizationName}</p>
              {completedDonation.status === 'queued' && (
                <p style={{ fontSize: 13, color: 'var(--amber-700)', marginTop: 8, lineHeight: 1.5 }}>
                  Your payout request will be processed at noon of the next business day.
                </p>
              )}
              {completedDonation.receiptUrl && (
                <a href={completedDonation.receiptUrl} target="_blank" rel="noopener" className="btn btn-primary" style={{ marginTop: 12 }}>📄 View Receipt</a>
              )}
            </div>
          )}

          {selectedCharity ? (
            <div className={styles.selectionCard}>
              <button className={styles.backBtn} onClick={() => setSelectedCharity(null)}>← Browse Charities</button>
              <div className={styles.selectionHeader}>
                <img src={selectedCharity.imageUrl} alt={selectedCharity.title} className={styles.selectionImg} />
                <h3>{selectedCharity.title}</h3>
                <p className={styles.selectionDesc}>{selectedCharity.organization}</p>
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="label">Donation Amount (USD)</label>
                <input className="input" type="number" min="1" max={maxUsd} step="1"
                  value={donateAmount} onChange={e => setDonateAmount(e.target.value)}
                  placeholder={`Up to ${formatUsd(availableUsd)}`} />
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 16 }}
                onClick={handleDonate}
                disabled={!donateAmount || parseFloat(donateAmount) < 1 || parseFloat(donateAmount) > maxUsd || donating}
              >{donating ? 'Processing...' : donateAmount ? `Donate ${formatUsd(parseFloat(donateAmount))}` : 'Enter Amount'}</button>
            </div>
          ) : (
            <>
              <div className={styles.searchBar}>
                <span className={styles.searchIcon}>🔍</span>
                <input className={styles.searchInput} placeholder="Search charities (press Enter)..." value={charitySearch}
                  onChange={e => { setCharitySearch(e.target.value); if (!e.target.value) setSearchResults(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleCharitySearch()}
                />
                {isSearching && <span className={styles.searchSpinner}>⏳</span>}
              </div>
              <div className={styles.filterRow}>
                {CHARITY_THEMES.map(th => (
                  <button key={th} onClick={() => setCharityTheme(th)}
                    className={`${styles.filterBtn} ${charityTheme === th ? styles.filterBtnActive : ''}`}
                  >{th}</button>
                ))}
              </div>
              {filteredCharities.length === 0 ? (
                <div className={styles.emptyState}><span className={styles.emptyIcon}>❤️</span><p>No charities found</p></div>
              ) : (
                <div className={styles.charityList}>
                  {filteredCharities.map(charity => {
                    const progress = Math.min(charity.raised / charity.goal, 1)
                    return (
                      <button key={charity.id} className={styles.charityCard} onClick={() => { setSelectedCharity(charity); setDonateAmount('') }}>
                        <img src={charity.imageUrl} alt={charity.title} className={styles.charityImg} />
                        <div className={styles.charityInfo}>
                          <span className={styles.charityTitle}>{charity.title}</span>
                          <span className={styles.charityOrg}>{charity.organization}</span>
                          <div className={styles.charityProgress}>
                            <div className={styles.charityProgressFill} style={{ width: `${progress * 100}%` }} />
                          </div>
                          <span className={styles.charityStats}>${charity.raised.toLocaleString()} / ${charity.goal.toLocaleString()}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Cashout Tab (Venmo/PayPal) ── */}
      {activeTab === 'cashout' && (
        <div className={styles.tabContent}>
          {cashoutResult?.success ? (
            <div className={styles.resultCard} style={cashoutResult.status === 'queued' ? { borderColor: 'var(--amber-300)', background: 'var(--amber-50)' } : undefined}>
              <div className={styles.resultIcon}>{cashoutResult.status === 'queued' ? '⏳' : '✅'}</div>
              <h3>{cashoutResult.status === 'queued' ? 'Payout Queued' : 'Payout Sent!'}</h3>
              <p>{formatUsd(parseFloat(cashoutAmount))} {cashoutResult.status === 'queued' ? 'queued for' : 'is on its way to'} {payoutStatus?.handle}</p>
              {cashoutResult.status === 'queued' ? (
                <p style={{ fontSize: 13, color: 'var(--amber-700)', marginTop: 8, lineHeight: 1.5 }}>
                  Your payout request will be processed at noon of the next business day.
                </p>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>Standard transfer: 1-2 business days, no fee</p>
              )}
              {cashoutResult.txnId && <p className={styles.resultCode}>Txn ID: <strong>{cashoutResult.txnId}</strong></p>}
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => { setCashoutResult(null); setCashoutAmount('') }}>Done</button>
            </div>
          ) : (
            <div className={styles.selectionCard}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>💸</div>
                <h3>Venmo / PayPal Payout</h3>
                <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Available: {formatUsd(availableUsd)} • Standard transfer (free, 1-2 days)</p>
              </div>

              {/* Payout destination status */}
              {payoutStatus?.verified && (
                <div style={{
                  padding: '14px 16px', borderRadius: 10, marginBottom: 16,
                  background: !isChangingHandle ? 'var(--green-50)' : 'var(--gray-50)',
                  border: `1px solid ${!isChangingHandle ? 'var(--green-200)' : 'var(--gray-200)'}`,
                }}>
                  {!isChangingHandle ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>✅</span>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: 14 }}>Saved: {payoutStatus.handle}</strong>
                        <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '2px 0 0' }}>
                          {payoutStatus.handle_type === 'venmo' ? 'Venmo' : 'PayPal'} • Ready for payouts
                        </p>
                      </div>
                      <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setIsChangingHandle(true)}>Change</button>
                    </div>
                  ) : (
                    <div>
                      <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Update Destination</strong>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        {(['venmo', 'paypal'] as const).map(t => (
                          <button key={t} onClick={() => setVerifyHandleType(t)}
                            style={{
                              flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                              border: `2px solid ${verifyHandleType === t ? 'var(--green-500)' : 'var(--gray-200)'}`,
                              background: verifyHandleType === t ? 'var(--green-50)' : 'var(--white)',
                            }}
                          >{t === 'venmo' ? '📱 Venmo' : '💳 PayPal'}</button>
                        ))}
                      </div>
                      <div className="form-group" style={{ marginBottom: 10 }}>
                        <input className="input" value={verifyHandle}
                          onChange={e => setVerifyHandle(e.target.value)}
                          placeholder={verifyHandleType === 'venmo' ? 'Venmo phone (+15555551234)' : 'PayPal email'} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 10 }}>
                        <input className="input" value={confirmVerifyHandle}
                          onChange={e => setConfirmVerifyHandle(e.target.value)}
                          placeholder={`Confirm ${verifyHandleType === 'venmo' ? 'Venmo phone' : 'PayPal email'}`} />
                      </div>
                      <button className="btn btn-primary" style={{ width: '100%' }}
                        onClick={handleSaveVerifiedDestination}
                        disabled={!verifyHandle.trim() || verifyHandle !== confirmVerifyHandle || verifyingHandle}
                      >{verifyingHandle ? 'Saving...' : 'Update Destination'}</button>
                      <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }}
                        onClick={() => setIsChangingHandle(false)}
                      >Cancel</button>
                      <p style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 8, lineHeight: 1.5 }}>
                        Double check for typos! The handle entered above will update your saved destination. 
                      </p>
                      {verifyError && <p style={{ fontSize: 12, color: 'var(--red-500)', marginTop: 6 }}>❌ {verifyError}</p>}
                    </div>
                  )}
                </div>
              )}

              {/* Cashout form */}
              <div className="form-group">
                <label className="label">Manual Payout Amount (USD)</label>
                <input className="input" type="number" min="0.01" max={maxUsd} step="0.01"
                  value={cashoutAmount} onChange={e => setCashoutAmount(e.target.value)}
                  placeholder={`Up to ${formatUsd(availableUsd)}`} />
                <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  Standard transfer • Free • 1-3 business days
                </p>
              </div>

              {!payoutStatus?.verified && parseFloat(cashoutAmount) > 0 && (
                <div style={{ marginTop: 16, padding: 16, background: 'var(--gray-50)', borderRadius: 10, border: '1px solid var(--gray-200)' }}>
                   <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>Where should we send this cashout?</p>
                   <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      {(['venmo', 'paypal'] as const).map(t => (
                        <button key={t} onClick={() => setCustomHandleType(t)}
                          style={{
                            flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: `2px solid ${customHandleType === t ? 'var(--blue-500)' : 'var(--gray-200)'}`,
                            background: customHandleType === t ? 'var(--blue-50)' : 'var(--white)',
                          }}
                        >{t === 'venmo' ? '📱 Venmo' : '💳 PayPal'}</button>
                      ))}
                    </div>
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <input className="input" value={customHandle}
                        onChange={e => setCustomHandle(e.target.value)}
                        placeholder={customHandleType === 'venmo' ? 'Venmo phone (+15555551234)' : 'PayPal email'} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <input className="input" value={confirmCustomHandle}
                        onChange={e => setConfirmCustomHandle(e.target.value)}
                        placeholder={`Confirm ${customHandleType === 'venmo' ? 'Venmo phone' : 'PayPal email'}`} />
                    </div>
                </div>
              )}

              <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 16 }}
                onClick={handleCashout}
                disabled={!cashoutAmount || Math.round(parseFloat(cashoutAmount) * 100) > Math.round(maxUsd * 100) || Math.round(parseFloat(cashoutAmount) * 100) < 1 || cashingOut || (!payoutStatus?.verified && (!customHandle || customHandle !== confirmCustomHandle))}
              >{cashingOut ? 'Processing...' : cashoutAmount ? `Send ${formatUsd(parseFloat(cashoutAmount))} to ${payoutStatus?.verified ? payoutStatus.handle : customHandle || '...'}` : 'Enter Amount'}</button>
            </div>
          )}
        </div>
      )}
          </div>
      )}
      </div>

      {/* ── Loading overlay ── */}
      {(redeeming || donating || cashingOut) && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingContent}>
            <div className={styles.spinner} />
            <p>Processing your {activeTab === 'giftCards' ? 'gift card' : activeTab === 'donate' ? 'donation' : 'payout'}...</p>
          </div>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  )
}

