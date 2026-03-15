'use client'

/**
 * Withdraw Earnings — Gift Cards, Donate, Cashout, 529 Savings
 *
 * Web equivalent of community app's RedemptionStore.
 * Uses real edge functions: fetch-gift-cards, fetch-donation-projects,
 * redeem-gift-card, donate-points, redeem-paypal-payout
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../lib/useAuth'
import { formatUsd } from '../../../../lib/store'
import { createClient } from '../../../../lib/supabase'
import styles from './page.module.css'

// ── Types ──
interface GiftCardProduct {
  brandName: string
  brandKey: string
  imageUrl: string
  category: string
  denominations: number[]
  minPrice: number
  maxPrice: number
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

type Tab = 'giftCards' | 'donate' | 'cashout' | '529'

const CHARITY_THEMES = ['All', 'Hunger', 'Environment', 'Education', 'Health']
const POINTS_PER_DOLLAR = 100

export default function RedeemPage() {
  const router = useRouter()
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const userId = user?.id
  const supabase = useMemo(() => createClient(), [])

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<Tab>('giftCards')

  // ── Balance ──
  const [availableUsd, setAvailableUsd] = useState(0)

  // ── Active methods (dynamic availability) ──
  const [activeMethods, setActiveMethods] = useState<{ method: string; is_active: boolean; instruments: { instrument: string; is_active: boolean }[] }[]>([])
  const [blockedMethods, setBlockedMethods] = useState<string[]>([])

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
  const [payoutId, setPayoutId] = useState('')
  const [cashoutAmount, setCashoutAmount] = useState('')
  const [cashingOut, setCashingOut] = useState(false)
  const [cashoutResult, setCashoutResult] = useState<{ success: boolean; txnId?: string } | null>(null)
  const [savedPayoutId, setSavedPayoutId] = useState<string | null>(null)

  // ── 529 state ──
  const [waitlistJoined, setWaitlistJoined] = useState(false)

  // ── Error state ──
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // ── Fetch balance ──
  useEffect(() => {
    if (!userId) return
    supabase.rpc('get_transaction_summary', {}).then(({ data }) => {
      if (data) setAvailableUsd(data.available_usd || 0)
    })
  }, [userId, supabase])

  // ── Fetch active redemption methods ──
  useEffect(() => {
    supabase.rpc('get_active_redemption_providers').then(({ data }) => {
      if (data) setActiveMethods(data)
    })
  }, [supabase])

  // ── Check method availability ──
  const isMethodAvailable = useCallback((methodName: string) => {
    if (blockedMethods.includes(methodName)) return false
    const m = activeMethods.find(m => m.method === methodName)
    if (!m?.is_active) return false
    if (m.instruments?.length > 0) return m.instruments.some(i => i.is_active)
    return true
  }, [activeMethods, blockedMethods])

  const availableTabs = useMemo(() => {
    const tabs: { key: Tab; icon: string; label: string }[] = []
    if (isMethodAvailable('giftcards')) tabs.push({ key: 'giftCards', icon: '🎁', label: 'Gift Cards' })
    if (isMethodAvailable('charity')) tabs.push({ key: 'donate', icon: '❤️', label: 'Donate' })
    if (isMethodAvailable('cashout')) tabs.push({ key: 'cashout', icon: '💸', label: 'Cashout' })
    if (isMethodAvailable('529c')) tabs.push({ key: '529', icon: '🎓', label: '529 Savings' })
    // Fallback if no methods active yet
    if (tabs.length === 0) {
      tabs.push({ key: 'giftCards', icon: '🎁', label: 'Gift Cards' })
      tabs.push({ key: 'donate', icon: '❤️', label: 'Donate' })
      tabs.push({ key: 'cashout', icon: '💸', label: 'Cashout' })
    }
    return tabs
  }, [isMethodAvailable])

  // ── Fetch gift cards catalog ──
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('fetch-gift-cards')
        if (!error && data?.cards?.length > 0) setCatalogCards(data.cards)
      } catch (err) { console.warn('[REDEEM] Catalog fetch failed:', err) }
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

  // ── Fetch saved payout ID ──
  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('paypal_payout_id').eq('id', userId).single()
      .then(({ data }) => {
        if (data?.paypal_payout_id) {
          setSavedPayoutId(data.paypal_payout_id)
          setPayoutId(data.paypal_payout_id)
        }
      })
  }, [userId, supabase])

  // ── Check 529 waitlist ──
  useEffect(() => {
    if (!userId) return
    supabase.from('feature_waitlist').select('id').eq('user_id', userId).eq('feature', '529').maybeSingle()
      .then(({ data }) => { if (data) setWaitlistJoined(true) })
  }, [userId, supabase])

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

  // ── Handlers ──
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
    setError(null)
    setRedeeming(true)
    const pointsCost = gcAmount * POINTS_PER_DOLLAR
    try {
      const { data, error } = await supabase.functions.invoke('redeem-gift-card', {
        body: { brandName: selectedCard.brandName, faceValueCents: Math.round(gcAmount * 100), pointsCost },
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
      setError(err.message || 'Gift card redemption failed')
    } finally { setRedeeming(false) }
  }, [selectedCard, gcAmount, supabase])

  const handleDonate = useCallback(async () => {
    if (!selectedCharity || !donateAmount) return
    setError(null)
    setDonating(true)
    const pts = parseInt(donateAmount) || 0
    try {
      const { data, error } = await supabase.functions.invoke('donate-points', {
        body: {
          projectId: selectedCharity.id,
          projectTitle: selectedCharity.title,
          organizationName: selectedCharity.organization,
          theme: selectedCharity.theme,
          pointsAmount: pts,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const usdAmt = pts / POINTS_PER_DOLLAR
      setAvailableUsd(prev => Math.max(0, prev - usdAmt))
      setCompletedDonation({
        organizationName: selectedCharity.organization,
        projectTitle: selectedCharity.title,
        theme: selectedCharity.theme,
        amount: pts,
        donatedAt: new Date().toISOString(),
        receiptId: data.receiptNumber,
        receiptUrl: data.receiptUrl,
        status: data.status || 'queued',
      })
      setSelectedCharity(null)
      setDonateAmount('')
    } catch (err: any) {
      setError(err.message || 'Donation failed')
    } finally { setDonating(false) }
  }, [selectedCharity, donateAmount, supabase])

  const handleCashout = useCallback(async () => {
    if (!payoutId.trim() || !cashoutAmount) return
    setError(null)
    setCashingOut(true)
    const pts = parseInt(cashoutAmount) || 0
    try {
      const { data, error } = await supabase.functions.invoke('redeem-paypal-payout', {
        body: { pointsToRedeem: pts, payoutId: payoutId.trim() },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Payout failed')
      const usdAmt = pts / POINTS_PER_DOLLAR
      setAvailableUsd(prev => Math.max(0, prev - usdAmt))
      setCashoutResult({ success: true, txnId: data.transactionId })
    } catch (err: any) {
      setError(err.message || 'Cashout failed')
    } finally { setCashingOut(false) }
  }, [payoutId, cashoutAmount, supabase])

  const handleJoinWaitlist = useCallback(async () => {
    if (!userId) return
    const { error } = await supabase.from('feature_waitlist').insert({ user_id: userId, feature: '529' })
    if (!error) {
      setWaitlistJoined(true)
      setSuccessMsg('You\'re on the list! We\'ll notify you when 529 plans become available. 🎉')
      setTimeout(() => setSuccessMsg(null), 5000)
    }
  }, [userId, supabase])

  // Auto-dismiss success states
  useEffect(() => {
    if (!redemptionResult) return
    const t = setTimeout(() => setRedemptionResult(null), 8000)
    return () => clearTimeout(t)
  }, [redemptionResult])

  useEffect(() => {
    if (!completedDonation) return
    const t = setTimeout(() => setCompletedDonation(null), 8000)
    return () => clearTimeout(t)
  }, [completedDonation])

  useEffect(() => {
    if (!cashoutResult) return
    const t = setTimeout(() => setCashoutResult(null), 8000)
    return () => clearTimeout(t)
  }, [cashoutResult])

  // ── Auth guards ──
  if (authLoading) return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>
  if (!isAuthenticated) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><h2>Sign in to withdraw</h2><Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link></div>
  }

  const maxPoints = Math.floor(availableUsd * POINTS_PER_DOLLAR)

  return (
    <div className="container-sm">
      <Link href="/earnings" className={styles.backLink}>← Back to Earnings</Link>

      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Withdraw Earnings</h1>
        <div className={styles.balanceBadge}>
          <span className={styles.balanceLabel}>Available</span>
          <span className={styles.balanceValue}>{formatUsd(availableUsd)}</span>
        </div>
      </div>

      {/* Error / Success */}
      {error && <div className={styles.alertError}>❌ {error} <button onClick={() => setError(null)} className={styles.alertClose}>✕</button></div>}
      {successMsg && <div className={styles.alertSuccess}>✅ {successMsg}</div>}

      {/* Tabs */}
      <div className={styles.tabGrid}>
        {availableTabs.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setSelectedCard(null); setSelectedCharity(null); setError(null) }}
            className={`${styles.tabBtn} ${activeTab === t.key ? styles.tabBtnActive : ''}`}
          >
            <span className={styles.tabIcon}>{t.icon}</span>
            <span className={styles.tabLabel}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Gift Cards Tab ── */}
      {activeTab === 'giftCards' && (
        <div className={styles.tabContent}>
          {/* Gift card detail/redemption sheet */}
          {redemptionResult && (
            <div className={styles.resultCard}>
              <div className={styles.resultIcon}>🎉</div>
              <h3>Gift Card {redemptionResult.status === 'completed' ? 'Ready!' : 'Processing...'}</h3>
              <p className={styles.resultBrand}>{redemptionResult.brandName} — {formatUsd(redemptionResult.amount)}</p>
              {redemptionResult.url && (
                <a href={redemptionResult.url} target="_blank" rel="noopener" className="btn btn-primary" style={{ marginTop: 12 }}>
                  🎁 Use Gift Card
                </a>
              )}
              {redemptionResult.code && <p className={styles.resultCode}>Code: <strong>{redemptionResult.code}</strong></p>}
              <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12 }}>This will dismiss automatically</p>
            </div>
          )}

          {selectedCard ? (
            /* Card selected — amount picker */
            <div className={styles.selectionCard}>
              <button className={styles.backBtn} onClick={() => setSelectedCard(null)}>← Browse Cards</button>
              <div className={styles.selectionHeader}>
                {selectedCard.imageUrl && <img src={selectedCard.imageUrl} alt={selectedCard.brandName} className={styles.selectionImg} />}
                <h3>{selectedCard.brandName}</h3>
                {selectedCard.description && <p className={styles.selectionDesc}>{selectedCard.description}</p>}
              </div>
              <div className={styles.amountGrid}>
                {selectedCard.denominations.map(d => (
                  <button key={d} onClick={() => setGcAmount(d)}
                    className={`${styles.amountBtn} ${gcAmount === d ? styles.amountBtnActive : ''}`}
                    disabled={d > availableUsd}
                  >{formatUsd(d)}</button>
                ))}
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 16 }}
                onClick={handleRedeemGiftCard}
                disabled={!gcAmount || gcAmount > availableUsd || redeeming}
              >
                {redeeming ? 'Processing...' : gcAmount ? `Redeem ${formatUsd(gcAmount)} Gift Card` : 'Select Amount'}
              </button>
            </div>
          ) : (
            /* Browse cards */
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
                    <button key={card.brandKey} className={styles.gcCard} onClick={() => { setSelectedCard(card); setGcAmount(null) }}>
                      {card.imageUrl && <img src={card.imageUrl} alt={card.brandName} className={styles.gcCardImg} />}
                      <span className={styles.gcCardName}>{card.brandName}</span>
                      <span className={styles.gcCardRange}>
                        {card.denominations.length > 1 ? `${formatUsd(card.minPrice)} – ${formatUsd(card.maxPrice)}` : formatUsd(card.minPrice)}
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
          {/* Completed donation receipt */}
          {completedDonation && (
            <div className={styles.resultCard}>
              <div className={styles.resultIcon}>💚</div>
              <h3>Thank You!</h3>
              <p>{(completedDonation.amount / POINTS_PER_DOLLAR).toLocaleString()} USD donated to {completedDonation.organizationName}</p>
              {completedDonation.receiptUrl && (
                <a href={completedDonation.receiptUrl} target="_blank" rel="noopener" className="btn btn-primary" style={{ marginTop: 12 }}>
                  📄 View Receipt
                </a>
              )}
              <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12 }}>This will dismiss automatically</p>
            </div>
          )}

          {selectedCharity ? (
            <div className={styles.selectionCard}>
              <button className={styles.backBtn} onClick={() => setSelectedCharity(null)}>← Browse Charities</button>
              <div className={styles.selectionHeader}>
                <img src={selectedCharity.imageUrl} alt={selectedCharity.title} className={styles.selectionImg} />
                <h3>{selectedCharity.title}</h3>
                <p className={styles.selectionDesc}>{selectedCharity.organization}</p>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>{selectedCharity.summary}</p>
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="label">Donation Amount (points)</label>
                <input className="input" type="number" min="100" max={maxPoints} step="100"
                  value={donateAmount} onChange={e => setDonateAmount(e.target.value)}
                  placeholder={`Up to ${maxPoints.toLocaleString()} pts (${formatUsd(availableUsd)})`}
                />
                {donateAmount && <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  ≈ {formatUsd(parseInt(donateAmount) / POINTS_PER_DOLLAR)} USD
                </p>}
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 16 }}
                onClick={handleDonate}
                disabled={!donateAmount || parseInt(donateAmount) < 100 || parseInt(donateAmount) > maxPoints || donating}
              >
                {donating ? 'Processing...' : donateAmount ? `Donate ${parseInt(donateAmount).toLocaleString()} pts` : 'Enter Amount'}
              </button>
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
                          <span className={styles.charitySummary}>{charity.summary}</span>
                          <div className={styles.charityProgress}>
                            <div className={styles.charityProgressFill} style={{ width: `${progress * 100}%` }} />
                          </div>
                          <span className={styles.charityStats}>
                            ${charity.raised.toLocaleString()} / ${charity.goal.toLocaleString()} • {Math.round(progress * 100)}%
                          </span>
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

      {/* ── Cashout Tab ── */}
      {activeTab === 'cashout' && (
        <div className={styles.tabContent}>
          {cashoutResult?.success ? (
            <div className={styles.resultCard}>
              <div className={styles.resultIcon}>✅</div>
              <h3>Funds Sent!</h3>
              <p>{formatUsd(parseInt(cashoutAmount) / POINTS_PER_DOLLAR)} is on its way to {payoutId}</p>
              {cashoutResult.txnId && <p className={styles.resultCode}>Txn ID: <strong>{cashoutResult.txnId}</strong></p>}
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => { setCashoutResult(null); setCashoutAmount('') }}>Done</button>
            </div>
          ) : (
            <div className={styles.selectionCard}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>💸</div>
                <h3>Cash Out via PayPal / Venmo</h3>
                <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Available: {formatUsd(availableUsd)} ({maxPoints.toLocaleString()} pts)</p>
              </div>
              <div className="form-group">
                <label className="label">Payout Amount (points)</label>
                <input className="input" type="number" min="100" max={maxPoints} step="100"
                  value={cashoutAmount} onChange={e => setCashoutAmount(e.target.value)}
                  placeholder={`Up to ${maxPoints.toLocaleString()} pts`}
                />
                {cashoutAmount && <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  ≈ {formatUsd(parseInt(cashoutAmount) / POINTS_PER_DOLLAR)} USD
                </p>}
              </div>
              <div className="form-group">
                <label className="label">PayPal Email or Venmo Phone</label>
                <input className="input" value={payoutId} onChange={e => setPayoutId(e.target.value)}
                  placeholder="email@example.com or +15555551234"
                />
              </div>
              <div className={styles.warningBox}>
                ⚠️ Please double-check this matches your account exactly. Reversing a transfer is difficult.
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 16 }}
                onClick={handleCashout}
                disabled={!payoutId.trim() || !cashoutAmount || parseInt(cashoutAmount) > maxPoints || parseInt(cashoutAmount) < 100 || cashingOut}
              >
                {cashingOut ? 'Processing...' : cashoutAmount ? `Cash Out ${formatUsd(parseInt(cashoutAmount) / POINTS_PER_DOLLAR)}` : 'Enter Amount'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 529 Tab ── */}
      {activeTab === '529' && (
        <div className={styles.tabContent}>
          <div className={styles.selectionCard} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎓</div>
            <h3>529 College Savings</h3>
            <p style={{ color: 'var(--gray-500)', marginBottom: 20, lineHeight: 1.6 }}>
              Coming soon! Transfer your market earnings directly into a 529 college savings plan. Tax-advantaged savings for education expenses.
            </p>
            {waitlistJoined ? (
              <div className={styles.alertSuccess} style={{ display: 'inline-block' }}>✅ You&apos;re on the waitlist!</div>
            ) : (
              <button className="btn btn-primary btn-lg" onClick={handleJoinWaitlist}>Join Waitlist</button>
            )}
          </div>
        </div>
      )}

      {/* ── Loading overlay ── */}
      {(redeeming || donating || cashingOut) && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingContent}>
            <div className={styles.spinner} />
            <p>Processing your {activeTab === 'giftCards' ? 'gift card' : activeTab === 'donate' ? 'donation' : 'cashout'}...</p>
          </div>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  )
}
