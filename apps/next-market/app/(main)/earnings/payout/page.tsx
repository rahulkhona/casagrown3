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

import { useState, useEffect, useMemo, useCallback } from 'react'
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
  const [verifyHandleType, setVerifyHandleType] = useState<'venmo' | 'paypal'>('venmo')
  const [verifyingHandle, setVerifyingHandle] = useState(false)
  const [verifyAmount, setVerifyAmount] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verifySuccess, setVerifySuccess] = useState(false)

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



  // ── Auto-payout state ──
  const [showAutoPay, setShowAutoPay] = useState(false)
  const [autoConfig, setAutoConfig] = useState<AutoPayConfig>({
    enabled: false, method: 'cashout', threshold_usd: 50,
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
    supabase.rpc('get_transaction_summary', {}).then(({ data }) => {
      if (data) {
        setAvailableUsd(data.available_usd || 0)
        setHeldBalanceUsd(data.held_balance_usd || 0)
      }
    })
  }, [userId, supabase])

  // ── Fetch active methods ──
  useEffect(() => {
    supabase.rpc('get_active_redemption_providers').then(({ data }) => {
      if (data) setActiveMethods(data)
    })
  }, [supabase])

  // ── Fetch payout status ──
  useEffect(() => {
    if (!userId) return
    supabase.rpc('get_payout_status').then(({ data }) => {
      if (data) {
        setPayoutStatus(data)
        if (data.handle) {
          setVerifyHandle(data.handle)
          setVerifyHandleType(data.handle_type || 'venmo')
        }
      }
    })
  }, [userId, supabase])

  // ── Fetch auto-payout config ──
  useEffect(() => {
    if (!userId) return
    supabase.rpc('get_auto_redemption_config').then(({ data }) => {
      if (data) setAutoConfig(data)
    })
  }, [userId, supabase])

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
    if (isMethodAvailable('cashout') || true) tabs.push({ key: 'cashout', icon: '💸', label: 'Venmo' })
    if (tabs.length === 0) {
      tabs.push({ key: 'giftCards', icon: '🎁', label: 'Gift Cards' })
      tabs.push({ key: 'donate', icon: '❤️', label: 'Donate' })
      tabs.push({ key: 'cashout', icon: '💸', label: 'Venmo' })
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
  // Verification handlers
  // ──────────────────────────────────────────────────────────
  const handleInitiateVerification = useCallback(async () => {
    if (!verifyHandle.trim()) return
    setVerifyError(null)
    setVerifyingHandle(true)
    try {
      const { data, error } = await supabase.rpc('initiate_payout_verification', {
        p_handle: verifyHandle.trim(),
        p_handle_type: verifyHandleType,
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Failed to initiate')

      // Call edge function to actually send the micro-transaction
      await supabase.functions.invoke('market-cashout-paypal', {
        body: { pointsToRedeem: 0, payoutId: verifyHandle.trim(), verificationAmount: data.amount },
      })

      setPayoutStatus(prev => prev ? ({
        ...prev, handle: verifyHandle.trim(), handle_type: verifyHandleType,
        verified: false, verification_pending: true,
        verification_sent_at: new Date().toISOString(), attempts: 0,
      }) : null)
      const sandboxHint = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
        ? ` (Sandbox mode — enter $${data.amount.toFixed(2)} to verify)`
        : ''
      setSuccessMsg(`We sent a small amount to your ${verifyHandleType === 'venmo' ? 'Venmo' : 'PayPal'}. It may take 1-2 business days to arrive.${sandboxHint}`)
      setTimeout(() => setSuccessMsg(null), 15000)
    } catch (err: any) {
      setVerifyError(err.message || 'Verification failed')
    } finally { setVerifyingHandle(false) }
  }, [verifyHandle, verifyHandleType, supabase])

  const handleConfirmVerification = useCallback(async () => {
    if (!verifyAmount) return
    setVerifyError(null)
    try {
      const { data, error } = await supabase.rpc('confirm_payout_verification', {
        p_received_amount: parseFloat(verifyAmount),
      })
      if (error) throw error
      if (data?.success && data?.verified) {
        setVerifySuccess(true)
        setPayoutStatus(prev => prev ? ({ ...prev, verified: true, verification_pending: false }) : null)
        setSuccessMsg('✅ Account verified! You can now receive payouts.')
        setTimeout(() => { setSuccessMsg(null); setVerifySuccess(false) }, 5000)
      } else {
        setVerifyError(data?.error || 'Verification failed')
      }
    } catch (err: any) {
      setVerifyError(err.message || 'Verification failed')
    }
  }, [verifyAmount, supabase])

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
    if (!payoutStatus?.verified || !payoutStatus.handle) {
      setError('Please verify your payout account first')
      return
    }
    if (!cashoutAmount) return
    trackClick('cashout', { amount: parseFloat(cashoutAmount) })
    setError(null)
    setCashingOut(true)
    const usdAmt = parseFloat(cashoutAmount) || 0
    try {
      const { data, error } = await supabase.functions.invoke('market-cashout-paypal', {
        body: { pointsToRedeem: Math.round(usdAmt * 100), payoutId: payoutStatus.handle },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Payout failed')
      setAvailableUsd(prev => Math.max(0, prev - usdAmt))
      setCashoutResult({ success: true, txnId: data.batch_id || data.transactionId, status: data.status || 'completed' })
    } catch (err: any) {
      trackError('cashout_failed', { error: err.message })
      setError(err.message || 'Cashout failed')
    } finally { setCashingOut(false) }
  }, [payoutStatus, cashoutAmount, supabase])



  // ── Auto-payout save ──
  const handleAutoSave = useCallback(async () => {
    trackClick('save_auto_payout', { method: autoConfig.method, threshold: autoConfig.threshold_usd })
    setError(null)
    setAutoSaving(true)
    setAutoSaved(false)
    try {
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

      {/* ── Auto/Manual Toggle ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 18px', background: autoConfig.enabled ? 'var(--green-50)' : 'var(--gray-50)',
        border: `1px solid ${autoConfig.enabled ? 'var(--green-200)' : 'var(--gray-200)'}`,
        borderRadius: 12, marginBottom: 20,
      }}>
        <div>
          <strong style={{ fontSize: 14, color: 'var(--gray-800)' }}>
            {autoConfig.enabled ? '⚡ Auto-Payout' : '🖐️ Manual Payout'}
          </strong>
          <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '2px 0 0' }}>
            {autoConfig.enabled
              ? 'Automatically pay out when your balance hits a threshold'
              : 'Choose how to use your earnings below'}
          </p>
          <p style={{ fontSize: 10, color: 'var(--gray-400)', margin: '2px 0 0' }}>
            Balances over $500 or 90 days of inactivity trigger mandatory settlement
          </p>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0 }}>
          <input type="checkbox" checked={autoConfig.enabled} onChange={e => setAutoConfig(prev => ({ ...prev, enabled: e.target.checked }))}
            style={{ opacity: 0, width: 0, height: 0 }} />
          <span style={{
            position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: 24,
            background: autoConfig.enabled ? 'var(--green-500)' : 'var(--gray-300)',
            transition: 'background 0.2s',
          }}>
            <span style={{
              position: 'absolute', height: 18, width: 18, left: autoConfig.enabled ? 22 : 3, bottom: 3,
              background: 'white', borderRadius: '50%', transition: 'left 0.2s',
            }} />
          </span>
        </label>
      </div>

      {autoConfig.enabled ? (
        /* ═══ AUTO-PAYOUT CONFIG ═══ */
        <div className={styles.tabContent} style={{ border: '1px solid var(--green-200)', borderRadius: 12, padding: 20, background: 'var(--white)' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Payout Method</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { key: 'cashout', icon: '💸', label: 'Venmo', disabled: !payoutStatus?.verified },
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
                  {m.disabled && <span style={{ fontSize: 10, color: 'var(--red-500)' }}>Unverified</span>}
                </button>
              ))}
            </div>
            {!payoutStatus?.verified && (
              <div style={{ fontSize: 12, color: 'var(--amber-700)', background: 'var(--amber-50)', padding: '10px 14px', borderRadius: 8, marginTop: 8, lineHeight: 1.5 }}>
                💡 To use Venmo for auto-payout, turn off auto-payout, then use the <strong>Venmo</strong> tab in manual mode to verify your account. Once verified, come back and enable auto-payout with Venmo.
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Payout Threshold</label>
            <p style={{ fontSize: 11, color: 'var(--gray-500)', margin: '0 0 8px' }}>When your balance reaches this amount, your full balance is automatically paid out</p>
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
            onClick={handleAutoSave} disabled={autoSaving}
          >{autoSaving ? 'Saving...' : autoSaved ? '✅ Saved!' : 'Save Auto-Payout Settings'}</button>
        </div>
      ) : (
        <>
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
                  Your gift card has been queued due to provider delays. You'll receive a notification when it's ready. No action needed.
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
                  Your donation has been queued and will be processed shortly. You'll receive a notification when complete.
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
                  Your payout has been queued due to provider delays. You’ll receive a notification when it’s processed. No action needed.
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

              {/* Verification status */}
              <div style={{
                padding: '14px 16px', borderRadius: 10, marginBottom: 16,
                background: payoutStatus?.verified ? 'var(--green-50)' : payoutStatus?.verification_pending ? 'var(--amber-50)' : 'var(--gray-50)',
                border: `1px solid ${payoutStatus?.verified ? 'var(--green-200)' : payoutStatus?.verification_pending ? 'var(--amber-200)' : 'var(--gray-200)'}`,
              }}>
                {payoutStatus?.verified ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <strong style={{ fontSize: 14 }}>Verified: {payoutStatus.handle}</strong>
                      <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '2px 0 0' }}>
                        {payoutStatus.handle_type === 'venmo' ? 'Venmo' : 'PayPal'} • Ready for payouts
                      </p>
                    </div>
                    <button onClick={() => {
                      setPayoutStatus(prev => prev ? ({ ...prev, verified: false, verification_pending: false, handle: null }) : null)
                      setVerifyHandle('')
                    }} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-400)', background: 'none', border: 'none', cursor: 'pointer' }}>Change</button>
                  </div>
                ) : payoutStatus?.verification_pending ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 20 }}>⏳</span>
                      <div>
                        <strong style={{ fontSize: 14 }}>Verification Pending</strong>
                        <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '2px 0 0' }}>
                          We sent a small amount to {payoutStatus.handle}. Enter the exact amount to verify.
                        </p>
                      </div>
                    </div>
                    {typeof window !== 'undefined' && window.location.hostname === 'localhost' && payoutStatus.verification_amount && (
                      <div style={{
                        padding: '8px 12px', borderRadius: 8, marginBottom: 10,
                        background: 'var(--blue-50, #eff6ff)', border: '1px solid var(--blue-200, #bfdbfe)',
                      }}>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--blue-700, #1d4ed8)' }}>
                          🧪 <strong>Sandbox mode:</strong> Enter <strong>${payoutStatus.verification_amount.toFixed(2)}</strong> to verify
                        </p>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="input" type="number" step="0.01" min="0.01" max="0.99" placeholder="$0.??"
                        value={verifyAmount} onChange={e => setVerifyAmount(e.target.value)}
                        style={{ flex: 1 }} />
                      <button className="btn btn-primary" onClick={handleConfirmVerification}
                        disabled={!verifyAmount}>Verify</button>
                    </div>
                    {verifyError && <p style={{ fontSize: 12, color: 'var(--red-500)', marginTop: 6 }}>❌ {verifyError}</p>}
                    {verifySuccess && <p style={{ fontSize: 12, color: 'var(--green-600)', marginTop: 6 }}>✅ Verified!</p>}
                  </div>
                ) : (
                  <div>
                    <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Set up payout account</strong>
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
                    <button className="btn btn-primary" style={{ width: '100%' }}
                      onClick={handleInitiateVerification}
                      disabled={!verifyHandle.trim() || verifyingHandle}
                    >{verifyingHandle ? 'Sending...' : 'Send Verification Amount'}</button>
                    <p style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 6, lineHeight: 1.5 }}>
                      We&apos;ll send a random small amount ($0.01–$0.99) via standard transfer (1-2 business days). Enter the exact amount you receive to verify ownership.
                    </p>
                    {verifyError && <p style={{ fontSize: 12, color: 'var(--red-500)', marginTop: 6 }}>❌ {verifyError}</p>}
                  </div>
                )}
              </div>

              {/* Cashout form — only if verified */}
              {payoutStatus?.verified && (
                <>
                  <div className="form-group">
                    <label className="label">Payout Amount (USD)</label>
                    <input className="input" type="number" min="0.01" max={maxUsd} step="0.01"
                      value={cashoutAmount} onChange={e => setCashoutAmount(e.target.value)}
                      placeholder={`Up to ${formatUsd(availableUsd)}`} />
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                      Standard transfer • Free • 1-2 business days
                    </p>
                  </div>
                  <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 16 }}
                    onClick={handleCashout}
                    disabled={!cashoutAmount || parseFloat(cashoutAmount) > maxUsd || parseFloat(cashoutAmount) < 0.01 || cashingOut}
                  >{cashingOut ? 'Processing...' : cashoutAmount ? `Send ${formatUsd(parseFloat(cashoutAmount))}` : 'Enter Amount'}</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      </>
      )}

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

