'use client'

import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { formatUsd } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { useMarketRestriction } from '../../../lib/useMarketRestriction'
import { MarketReceiptSheet, type MarketReceiptData } from '../../components/MarketReceiptSheet'
import { useNotificationPrompt } from '../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../../components/NotificationPromptModal'
import { NotificationBanner } from '../../components/NotificationBanner'
import { useErrorToast } from '../../components/ErrorToast'
import styles from './page.module.css'

// ── Types ──
interface TransactionEntry {
  tx_id: string
  tx_type: string
  tx_date: string
  description: string
  amount: number
  direction: string
  status: string
  counterparty: string | null
  metadata: Record<string, any>
}

interface TransactionSummary {
  total_sales: number
  sales_count: number
  total_purchases: number
  purchase_count: number
  total_fees: number
  total_redeemed: number
  processing_payouts_usd?: number
  total_cc_charged: number
  refunds_received: number
  refunds_issued: number
  net_earnings: number
  available_usd: number
  pending_usd: number
  held_balance_usd: number
  total_earned_usd: number
  total_spent_usd: number
  total_withdrawn_usd: number
}

type Tab = 'activity' | 'pending' | 'summary'
type DateRange = 'month' | 'ytd' | 'lifetime' | 'custom'

const TX_ICONS: Record<string, { icon: string; cls: string }> = {
  purchase:          { icon: '🛒', cls: styles.iconPurchase },
  sale:              { icon: '💰', cls: styles.iconSale },
  cc_charge:         { icon: '💳', cls: styles.iconCharge },
  cc_purchase:       { icon: '💳', cls: styles.iconPayment },
  platform_fee:      { icon: '📉', cls: styles.iconFee },
  gift_card:         { icon: '🎁', cls: styles.iconGiftCard },
  charity:           { icon: '🤝', cls: styles.iconCharity },
  cashout:           { icon: '💸', cls: styles.iconCashout },
  settlement_credit: { icon: '✅', cls: styles.iconCredit },
  funds_cleared:     { icon: '🏦', cls: styles.iconCredit },
  refund:            { icon: '↩️', cls: styles.iconRefund },
  balance_held:      { icon: '🔒', cls: styles.iconCharge },
  balance_released:  { icon: '🔓', cls: styles.iconCredit },
}

function getDateRange(range: DateRange, customStart?: string, customEnd?: string) {
  const now = new Date()
  switch (range) {
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }
    }
    case 'ytd': {
      const start = new Date(now.getFullYear(), 0, 1)
      return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }
    }
    case 'lifetime':
      return { start: null, end: null }
    case 'custom':
      return { start: customStart || null, end: customEnd || null }
  }
}

export default function EarningsPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const restriction = useMarketRestriction()
  const userId = user?.id
  const { showPrompt, modalProps } = useNotificationPrompt(userId)
  const [tab, setTab] = useState<Tab>('activity')
  const [dateRange, setDateRange] = useState<DateRange>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [transactions, setTransactions] = useState<TransactionEntry[]>([])
  const [pending, setPending] = useState<TransactionEntry[]>([])
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [credits, setCredits] = useState<{ purchase_credits_usd: number, platform_fee_credits_usd: number, total_credits_usd: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [receiptData, setReceiptData] = useState<MarketReceiptData | null>(null)
  const [ratingHover, setRatingHover] = useState<{ txId: string; star: number } | null>(null)
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, { star: number, review: string }>>({})
  const [ratedOrders, setRatedOrders] = useState<Record<string, number>>({})
  const { showError, showSuccess } = useErrorToast()

  // 1099 Tax Reporting thresholds
  const [taxThreshold, setTaxThreshold] = useState<{ amount: number; minTxns: number; warnPct: number } | null>(null)
  const [userState, setUserState] = useState<string | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const dates = useMemo(() => getDateRange(dateRange, customStart, customEnd), [dateRange, customStart, customEnd])

  // ── Fetch transactions ──
  const fetchTransactions = useCallback(async (offset = 0, append = false) => {
    if (!userId) return
    if (offset === 0) setLoading(true)
    else setLoadingMore(true)

    try {
      const { data, error } = await supabase.rpc('get_transaction_log', {
        p_start_date: dates.start,
        p_end_date: dates.end,
        p_limit: 50,
        p_offset: offset,
      })

      if (!error && data) {
        if (append) {
          setTransactions(prev => [...prev, ...data])
        } else {
          setTransactions(data)
        }
        setHasMore(data.length === 50)
      }
    } catch (err) {
      console.error('[EARNINGS] Fetch error:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [userId, supabase, dates])

  // ── Fetch summary ──
  const fetchSummary = useCallback(async () => {
    if (!userId) return
    try {
      const { data, error } = await supabase.rpc('get_transaction_summary', {
        p_start_date: dates.start,
        p_end_date: dates.end,
      })
      if (!error && data) setSummary(data)
    } catch (err) {
      console.error('[EARNINGS] Summary error:', err)
    }
  }, [userId, supabase, dates])

  // ── Fetch pending ──
  const fetchPending = useCallback(async () => {
    if (!userId) return
    try {
      const { data, error } = await supabase.rpc('get_pending_transactions')
      if (!error && data) setPending(data)
    } catch (err) {
      console.error('[EARNINGS] Pending error:', err)
    }
  }, [userId, supabase])

  // ── Fetch credits ──
  const fetchCredits = useCallback(async () => {
    if (!userId) return
    try {
      const { data, error } = await supabase.rpc('get_user_credit_balance', { p_user_id: userId })
      if (!error && data) setCredits(data as any)
    } catch (err) {
      console.error('[EARNINGS] Credits error:', err)
    }
  }, [userId, supabase])

  // ── Fetch on mount / date change ──
  useEffect(() => {
    if (isAuthenticated && userId) {
      fetchTransactions()
      fetchSummary()
      fetchPending()
      fetchCredits()

      // Load user state and tax reporting threshold
      supabase.from('profiles').select('state_code').eq('id', userId).single()
        .then(async ({ data: profile }) => {
          const sc = profile?.state_code || null
          setUserState(sc)
          // Try state-specific threshold, fall back to _default
          const { data: stateRow } = await supabase
            .from('tax_reporting_thresholds')
            .select('amount, min_txns, warn_pct')
            .eq('state_code', sc || '_default')
            .single()
          if (stateRow) {
            setTaxThreshold({ amount: stateRow.amount, minTxns: stateRow.min_txns, warnPct: stateRow.warn_pct })
          } else {
            const { data: defaultRow } = await supabase
              .from('tax_reporting_thresholds')
              .select('amount, min_txns, warn_pct')
              .eq('state_code', '_default')
              .single()
            if (defaultRow) setTaxThreshold({ amount: defaultRow.amount, minTxns: defaultRow.min_txns, warnPct: defaultRow.warn_pct })
          }
        })
    }
  }, [isAuthenticated, userId, fetchTransactions, fetchSummary, fetchPending, fetchCredits])

  // Trigger notification prompt on mount
  useEffect(() => { showPrompt() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open receipt ──
  const openReceipt = useCallback(async (tx: TransactionEntry) => {
    if (tx.tx_type !== 'purchase' && tx.tx_type !== 'sale') return
    const m = tx.metadata
    const viewAs = tx.tx_type === 'sale' ? 'seller' : 'buyer'

    // Look up compliance footer from seller zip
    let receiptFooter: string | undefined
    const sellerZip = m.seller_zip
    if (sellerZip) {
      try {
        const zipInt = parseInt(sellerZip.substring(0, 5), 10)
        // Map zip range → state code (simplified for major states)
        let stateCode: string | null = null
        if (zipInt >= 32000 && zipInt <= 34999) stateCode = 'FL'
        else if (zipInt >= 90000 && zipInt <= 96199) stateCode = 'CA'
        else if (zipInt >= 10000 && zipInt <= 14999) stateCode = 'NY'
        else if (zipInt >= 73000 && zipInt <= 74999) stateCode = 'OK'
        // Add more as needed

        if (stateCode) {
          const { data: footer } = await supabase
            .from('receipt_footers')
            .select('footer_text')
            .eq('state_code', stateCode)
            .maybeSingle()
          if (footer?.footer_text) receiptFooter = footer.footer_text
        }
      } catch { /* skip footer */ }
    }

    setReceiptData({
      orderId: m.order_id || tx.tx_id,
      date: tx.tx_date,
      status: tx.status,
      sellerName: m.seller_name || tx.counterparty || 'N/A',
      buyerName: m.buyer_name || tx.counterparty || 'N/A',
      productName: m.product_name || tx.description,
      quantity: m.quantity || 1,
      unitPrice: m.unit_price || tx.amount,
      subtotal: m.subtotal || tx.amount,
      taxRate: m.tax_rate || 0,
      taxAmount: m.tax_amount || 0,
      platformFee: m.platform_fee || 0,
      netPayout: m.net_payout,
      creditApplied: m.credit_applied || 0,
      total: m.total || tx.amount,
      fulfillment: m.fulfillment || 'pickup',
      settlementId: m.settlement_id,
      sellerZip: m.seller_zip,
      buyerZip: m.buyer_zip,
      receiptFooter,
      viewAs,
    })
  }, [supabase])

  // ── Rate order handler ──
  const handleRate = useCallback(async (orderId: string, rating: number, review?: string) => {
    setRatedOrders(prev => ({ ...prev, [orderId]: rating }))
    setRatingDrafts(prev => { const next = { ...prev }; delete next[orderId]; return next })
    try {
      const { data, error } = await supabase.rpc('rate_market_order', {
        p_order_id: orderId,
        p_rating: rating,
        p_review: review?.trim() || null
      })
      if (error || data?.error) {
        showError('Rating error: ' + (error?.message || data?.error))
        setRatedOrders(prev => { const next = { ...prev }; delete next[orderId]; return next })
      } else {
        showSuccess(data?.updated ? 'Rating updated!' : 'Rating submitted!')
      }
    } catch (e: any) {
      console.error('Rating failed:', e)
      showError('Rating failed: ' + (e.message || 'Unknown error'))
    }
  }, [supabase])

  // ── Auth guards ──
  if (authLoading) return <LoadingSpinner />
  if (!isAuthenticated) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><h2>Sign in to view earnings</h2><Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link></div>
  }

  // ── 1099 thresholds ──
  const ytdSales = summary?.total_sales || 0
  const ytdSalesCount = summary?.sales_count || 0
  const thresholdAmount = taxThreshold?.amount || 20000
  const thresholdMinTxns = taxThreshold?.minTxns || 200
  const warnPct = taxThreshold?.warnPct || 0.75
  const thresholdBreached = ytdSales >= thresholdAmount && (thresholdMinTxns === 0 || ytdSalesCount >= thresholdMinTxns)
  const approachingThreshold = !thresholdBreached && ytdSales >= thresholdAmount * warnPct
  const progress1099 = Math.min(100, (ytdSales / thresholdAmount) * 100)

  return (
    <div className="container">
      <div className={styles.pageWrap}>
        <div className="page-header">
          <h1 className="page-title">Earnings & Activity</h1>
          <p className="page-subtitle">Your market transactions, receipts, and payouts</p>
        </div>

        <NotificationPromptModal {...modalProps} />
        <NotificationBanner context="payout updates and order alerts" onEnableClick={showPrompt} />

        {/* ── Free sharing mode banner ── */}
        {restriction.isFreeOnly && (
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12,
            padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 28 }}>🏛️</span>
            <div>
              <strong style={{ color: '#1e40af', fontSize: 15 }}>Free Sharing Mode</strong>
              <p style={{ color: '#3b82f6', fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 }}>
                Your state ({restriction.stateName}) requires produce to be shared at no cost.
                All transactions are free claims &mdash; no financial earnings will accrue.
                We&apos;re working on enabling paid transactions in your area.
              </p>
            </div>
          </div>
        )}

        {/* ── 1099 Threshold Warning ── */}
        {thresholdBreached && (
          <div style={{
            background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 12,
            padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 28 }}>🚨</span>
            <div>
              <strong style={{ color: '#991b1b', fontSize: 15 }}>1099-K Reporting Threshold Reached</strong>
              <p style={{ color: '#7f1d1d', fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 }}>
                Your year-to-date sales ({formatUsd(ytdSales)}) have reached the
                {userState ? ` ${userState}` : ' federal'} reporting threshold of {formatUsd(thresholdAmount)}.
                You will receive a 1099-K tax form. Please consult a tax advisor. 
                New sales may be paused until next calendar year.
              </p>
            </div>
          </div>
        )}

        {approachingThreshold && (
          <div style={{
            background: '#fffbeb', border: '2px solid #fde68a', borderRadius: 12,
            padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 28 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#92400e', fontSize: 15 }}>Approaching 1099-K Reporting Threshold</strong>
              <p style={{ color: '#78350f', fontSize: 13, margin: '6px 0 8px', lineHeight: 1.5 }}>
                Your year-to-date sales ({formatUsd(ytdSales)}) are approaching the
                {userState ? ` ${userState}` : ' federal'} reporting threshold of {formatUsd(thresholdAmount)}.
                Once reached, you will receive a 1099-K tax form for this calendar year.
              </p>
              <div style={{ height: 6, background: '#fef3c7', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress1099}%`, background: progress1099 >= 90 ? '#ef4444' : '#f59e0b', borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>
                {formatUsd(ytdSales)} / {formatUsd(thresholdAmount)} ({Math.round(progress1099)}%)
              </div>
            </div>
          </div>
        )}

        {/* ── Date Filter ── */}
        <div className={styles.dateBar}>
          {(['month', 'ytd', 'lifetime', 'custom'] as DateRange[]).map(r => (
            <button key={r} onClick={() => setDateRange(r)}
              className={`${styles.dateBtn} ${dateRange === r ? styles.dateBtnActive : ''}`}
            >
              {r === 'month' ? 'This Month' : r === 'ytd' ? 'Year to Date' : r === 'lifetime' ? 'All Time' : 'Custom'}
            </button>
          ))}
          {dateRange === 'custom' && (
            <>
              <input type="date" className={styles.dateInput} value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <span style={{ color: 'var(--gray-400)', fontSize: 13 }}>to</span>
              <input type="date" className={styles.dateInput} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </>
          )}
        </div>

        {/* ── Credits ── */}
        {credits && credits.total_credits_usd > 0 && (
          <div style={{
            background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 12,
            padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 28 }}>💰</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--green-900)', fontSize: 16 }}>Credits Available</strong>
              <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
                {credits.purchase_credits_usd > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--green-700)', fontWeight: 600, textTransform: 'uppercase' }}>For Purchases</div>
                    <div style={{ fontSize: 20, color: 'var(--green-800)', fontWeight: 700 }}>{formatUsd(credits.purchase_credits_usd)}</div>
                  </div>
                )}
                {credits.platform_fee_credits_usd > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--green-700)', fontWeight: 600, textTransform: 'uppercase' }}>For Seller Fees</div>
                    <div style={{ fontSize: 20, color: 'var(--green-800)', fontWeight: 700 }}>{formatUsd(credits.platform_fee_credits_usd)}</div>
                  </div>
                )}
              </div>
              <p style={{ color: 'var(--green-800)', fontSize: 13, margin: '8px 0 0', lineHeight: 1.5 }}>
                Credits are automatically applied to your transactions. Strictly 1 credit applies per order.
              </p>
            </div>
          </div>
        )}

        {/* ── Summary Cards ── */}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard} style={{ borderColor: 'var(--green-300)' }}>
            <span className={styles.summaryLabel}>Available</span>
            <span className={styles.summaryValue} style={{ color: 'var(--green-700)' }}>{formatUsd(summary?.available_usd || 0)}</span>
            {(summary?.available_usd || 0) > 0 && (
              <Link href="/earnings/payout" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Payout →</Link>
            )}
          </div>
          <div className={styles.summaryCard} style={(summary?.processing_payouts_usd || 0) > 0 ? { borderColor: 'var(--amber-300)', background: 'var(--amber-50)' } : {}}>
            <span className={styles.summaryLabel}>⏳ Processing Payouts</span>
            <span className={styles.summaryValue} style={{ color: (summary?.processing_payouts_usd || 0) > 0 ? 'var(--amber-700)' : 'inherit' }}>
              {formatUsd(summary?.processing_payouts_usd || 0)}
            </span>
            <span className={styles.summaryHint}>Transfers requested and arriving soon</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Unsettled</span>
            <span className={styles.summaryValue}>{formatUsd(summary?.pending_usd || 0)}</span>
            <span className={styles.summaryHint}>{pending.length} orders awaiting clearance</span>
          </div>
          {(summary?.held_balance_usd || 0) > 0 && (
            <div className={styles.summaryCard} style={{ borderColor: 'var(--amber-300)', background: 'var(--amber-50)' }}>
              <span className={styles.summaryLabel}>🔒 Held for Purchases</span>
              <span className={styles.summaryValue} style={{ color: 'var(--amber-700)' }}>{formatUsd(summary?.held_balance_usd || 0)}</span>
              <span className={styles.summaryHint}>Applied to orders, released at settlement</span>
            </div>
          )}
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Total Sales</span>
            <span className={styles.summaryValue} style={{ color: 'var(--green-700)' }}>{formatUsd(summary?.total_sales || 0)}</span>
            <span className={styles.summaryHint}>{summary?.sales_count || 0} orders sold</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Total Purchases</span>
            <span className={styles.summaryValue} style={{ color: 'var(--blue-600, #2563eb)' }}>{formatUsd(summary?.total_purchases || 0)}</span>
            <span className={styles.summaryHint}>{summary?.purchase_count || 0} orders bought</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Card Payments</span>
            <span className={styles.summaryValue}>{formatUsd(summary?.total_cc_charged || 0)}</span>
            <span className={styles.summaryHint}>Net card charges after netting</span>
          </div>
        </div>

        {/* ── Auto-Withdraw CTA ── */}
        <Link href="/earnings/payout" className={styles.autoRedeemCard}>
          <span style={{ fontSize: 24 }}>⚡</span>
          <div>
            <strong style={{ fontSize: 14, color: 'var(--gray-800)' }}>Set up Auto-Payout</strong>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Automatically convert earnings to gift cards, cashout, or charity</div>
          </div>
        </Link>

        {/* ── Tabs ── */}
        <div className={styles.tabBar}>
          {([
            { key: 'activity' as Tab, label: '📋 Activity' },
            { key: 'pending' as Tab, label: `⏳ Unsettled (${pending.length})` },
            { key: 'summary' as Tab, label: '📊 Summary' },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            >{t.label}</button>
          ))}
        </div>

        {/* ── Activity Tab ── */}
        {tab === 'activity' && (
          <>
            {loading ? (
              <div className={styles.emptyState}><p>Loading transactions...</p></div>
            ) : transactions.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>📭</span>
                <p>No transactions for this period</p>
              </div>
            ) : (
              <div className={styles.txList}>
                {transactions.map(tx => {
                  const iconCfg = TX_ICONS[tx.tx_type] || { icon: '📄', cls: '' }
                  const isCredit = tx.direction === 'credit'
                  const isExpanded = expandedId === tx.tx_id
                  return (
                    <div key={tx.tx_id}>
                      <div className={styles.txRow} onClick={() => {
                        if (tx.tx_type === 'purchase' || tx.tx_type === 'sale') {
                          openReceipt(tx)
                        } else {
                          setExpandedId(isExpanded ? null : tx.tx_id)
                        }
                      }}>
                        <div className={styles.txLeft}>
                          <div className={`${styles.txIcon} ${iconCfg.cls}`}>{iconCfg.icon}</div>
                          <div className={styles.txInfo}>
                            <span className={styles.txTitle}>{tx.description}</span>
                            <span className={styles.txSub}>
                              {new Date(tx.tx_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {tx.counterparty ? ` • ${tx.counterparty}` : ''}
                            </span>
                          </div>
                        </div>
                        <div className={styles.txRight}>
                          <span className={`${styles.txAmount} ${isCredit ? styles.txAmountCredit : styles.txAmountDebit}`}>
                            {isCredit ? '+' : '-'}{formatUsd(tx.amount)}
                          </span>
                          <div className={styles.txStatus}>{tx.status}</div>
                        </div>
                      </div>

                      {/* Star rating prompt for completed sale/purchase */}
                      {tx.status === 'completed' && (tx.tx_type === 'purchase' || tx.tx_type === 'sale') && tx.metadata?.order_id && (
                        <div style={{
                          padding: '6px 16px 10px 52px', display: 'flex', flexDirection: 'column', gap: 8,
                          borderBottom: '1px solid var(--border)', background: 'var(--green-50)',
                        }}>
                          {ratedOrders[tx.metadata.order_id] ? (
                            <span style={{ fontSize: 12, color: 'var(--green-700)' }}>
                              ⭐ Rated {ratedOrders[tx.metadata.order_id]}/5 — Thank you!
                            </span>
                          ) : (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Rate:</span>
                                {[1, 2, 3, 4, 5].map(star => {
                                  const draft = ratingDrafts[tx.metadata.order_id]
                                  const isActive = ratingHover?.txId === tx.tx_id && star <= ratingHover.star || (draft && star <= draft.star)
                                  return (
                                    <button
                                      key={star}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setRatingDrafts(prev => ({ ...prev, [tx.metadata.order_id]: { star, review: prev[tx.metadata.order_id]?.review || '' } }))
                                      }}
                                      onMouseEnter={() => setRatingHover({ txId: tx.tx_id, star })}
                                      onMouseLeave={() => setRatingHover(null)}
                                      style={{
                                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 1px', fontSize: 18,
                                        opacity: isActive ? 1 : 0.3,
                                        transform: isActive ? 'scale(1.2)' : 'scale(1)',
                                        transition: 'all 0.15s',
                                        filter: isActive ? 'none' : 'grayscale(0.5)',
                                      }}
                                      title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                                    >
                                      ⭐
                                    </button>
                                  )
                                })}
                              </div>

                              {ratingDrafts[tx.metadata.order_id]?.star > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360, marginTop: 4 }}>
                                  <textarea
                                    placeholder={ratingDrafts[tx.metadata.order_id].star <= 2 ? "Please tell us what went wrong... (Required)" : "Add a note (optional)"}
                                    value={ratingDrafts[tx.metadata.order_id].review}
                                    onClick={e => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation()
                                      const val = e.target.value
                                      setRatingDrafts(prev => ({ ...prev, [tx.metadata.order_id]: { ...prev[tx.metadata.order_id], review: val } }))
                                    }}
                                    style={{
                                      width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb',
                                      borderRadius: 6, fontSize: 12, minHeight: 40, resize: 'vertical',
                                      fontFamily: 'inherit', boxSizing: 'border-box'
                                    }}
                                  />
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const draft = ratingDrafts[tx.metadata.order_id]
                                        handleRate(tx.metadata.order_id, draft.star, draft.review)
                                      }}
                                      disabled={ratingDrafts[tx.metadata.order_id].star <= 2 && !ratingDrafts[tx.metadata.order_id].review.trim()}
                                      style={{
                                        padding: '6px 12px', 
                                        background: (ratingDrafts[tx.metadata.order_id].star <= 2 && !ratingDrafts[tx.metadata.order_id].review.trim()) ? '#9ca3af' : 'var(--green-600, #16a34a)',
                                        color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12,
                                        cursor: (ratingDrafts[tx.metadata.order_id].star <= 2 && !ratingDrafts[tx.metadata.order_id].review.trim()) ? 'not-allowed' : 'pointer'
                                      }}
                                    >
                                      Submit Rating
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setRatingDrafts(prev => { const next = { ...prev }; delete next[tx.metadata.order_id]; return next })
                                      }}
                                      style={{
                                        padding: '6px 12px', background: 'none', color: 'var(--gray-500)',
                                        border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Expanded metadata */}
                      {isExpanded && tx.metadata && (
                        <div className={styles.txMeta}>
                          {tx.tx_type === 'cc_charge' && (
                            <>
                              {tx.metadata.card_last4 && <div className={styles.metaItem}><span className={styles.metaLabel}>Card:</span> {tx.metadata.card_brand || 'Card'} •••• {tx.metadata.card_last4}</div>}
                              {tx.metadata.captured && <div className={styles.metaItem}><span className={styles.metaLabel}>Captured:</span> {formatUsd(tx.metadata.captured)}</div>}
                              {tx.metadata.released && parseFloat(tx.metadata.released) > 0 && <div className={styles.metaItem}><span className={styles.metaLabel}>Released:</span> {formatUsd(tx.metadata.released)}</div>}
                            </>
                          )}
                          {tx.tx_type === 'gift_card' && (
                            <>
                              {tx.metadata.item_name && <div className={styles.metaItem}><span className={styles.metaLabel}>Card:</span> {tx.metadata.item_name}</div>}
                              {tx.metadata.gift_card_url && (
                                <div className={styles.metaActions}>
                                  <a href={tx.metadata.gift_card_url} target="_blank" rel="noopener" className={styles.metaLink}>🎁 Use Gift Card</a>
                                  <button
                                    className={styles.shareBtn}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const shareData = {
                                        title: `${tx.metadata.item_name || 'Gift Card'} from CasaGrown`,
                                        text: `Here's your ${tx.metadata.item_name || 'gift card'} worth ${formatUsd(Math.abs(tx.amount))}!`,
                                        url: tx.metadata.gift_card_url,
                                      };
                                      if (navigator.share) {
                                        try { await navigator.share(shareData); } catch { /* user cancelled */ }
                                      } else {
                                        await navigator.clipboard.writeText(tx.metadata.gift_card_url);
                                        alert('Gift card link copied!');
                                      }
                                    }}
                                  >
                                    📤 Share
                                  </button>
                                </div>
                              )}
                              {tx.metadata.gift_card_code && (
                                <div className={styles.metaItem}>
                                  <span className={styles.metaLabel}>Code:</span>
                                  <code style={{ background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{tx.metadata.gift_card_code}</code>
                                  <button
                                    className={styles.shareBtnSmall}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(tx.metadata.gift_card_code);
                                      const btn = e.currentTarget;
                                      btn.textContent = '✓';
                                      setTimeout(() => btn.textContent = '📋', 1500);
                                    }}
                                  >📋</button>
                                </div>
                              )}
                            </>
                          )}
                          {tx.tx_type === 'charity' && (
                            <>
                              {tx.metadata.item_name && <div className={styles.metaItem}><span className={styles.metaLabel}>Organization:</span> {tx.metadata.item_name}</div>}
                              {tx.metadata.gg_receipt_number && <div className={styles.metaItem}><span className={styles.metaLabel}>Receipt #:</span> {tx.metadata.gg_receipt_number}</div>}
                              {tx.metadata.tax_deductible_amount && <div className={styles.metaItem}><span className={styles.metaLabel}>Tax Deductible:</span> {formatUsd(tx.metadata.tax_deductible_amount)}</div>}
                              {tx.metadata.charity_receipt_url
                                ? <div className={styles.metaItem}><a href={tx.metadata.charity_receipt_url} target="_blank" rel="noopener" className={styles.metaLink}>📄 View Receipt</a></div>
                                : tx.metadata.gg_receipt_number && <div className={styles.metaItem} style={{ color: 'var(--gray-400)', fontStyle: 'italic' }}>📧 Tax receipt emailed by GlobalGiving</div>
                              }
                            </>
                          )}
                          {tx.tx_type === 'cashout' && (
                            <>
                              {tx.metadata.cashout_txn_id && <div className={styles.metaItem}><span className={styles.metaLabel}>Txn ID:</span> {tx.metadata.cashout_txn_id}</div>}
                              {tx.metadata.payout_method && <div className={styles.metaItem}><span className={styles.metaLabel}>Method:</span> {tx.metadata.payout_method}</div>}
                            </>
                          )}
                          {tx.tx_type === 'cc_purchase' && (
                            <>
                              {tx.metadata.points_amount && <div className={styles.metaItem}><span className={styles.metaLabel}>Points:</span> {tx.metadata.points_amount}</div>}
                              {tx.metadata.card_last4 && <div className={styles.metaItem}><span className={styles.metaLabel}>Card:</span> •••• {tx.metadata.card_last4}</div>}
                            </>
                          )}
                          {tx.tx_type === 'settlement_credit' && tx.metadata.orders && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {/* Settlement status + availability */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{
                                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                                  background: tx.metadata.settlement_status === 'cleared' ? 'var(--green-100, #dcfce7)' : 'var(--amber-100, #fef3c7)',
                                  color: tx.metadata.settlement_status === 'cleared' ? 'var(--green-700, #15803d)' : 'var(--amber-700, #b45309)',
                                }}>
                                  {tx.metadata.settlement_status === 'cleared' ? '✓ Cleared' : '⏳ Pending clearance'}
                                </span>
                                {tx.metadata.available_at && tx.metadata.settlement_status !== 'cleared' && (
                                  <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                                    Est. available: {new Date(tx.metadata.available_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                )}
                                {tx.metadata.market_date && (
                                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                                    Market: {new Date(tx.metadata.market_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </div>
                              {/* Order breakdown */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {(tx.metadata.orders as any[]).map((o: any, i: number) => (
                                  <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '4px 8px', borderRadius: 6,
                                    background: 'var(--gray-50, #f9fafb)', fontSize: 12,
                                  }}>
                                    <span style={{ color: 'var(--gray-700)' }}>
                                      {o.product} × {o.qty}
                                      <span style={{ color: 'var(--gray-400)', marginLeft: 6 }}>
                                        {o.fulfillment === 'delivery' ? '🚗' : '📍'} {o.buyer}
                                      </span>
                                    </span>
                                    <span style={{ fontWeight: 600, color: 'var(--gray-700)' }}>{formatUsd(o.amount)}</span>
                                  </div>
                                ))}
                              </div>
                              {/* Fees + net */}
                              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--gray-500)', paddingTop: 4, borderTop: '1px solid var(--gray-100)' }}>
                                {tx.metadata.fees > 0 && <span>Fees: -{formatUsd(tx.metadata.fees)}</span>}
                                <span style={{ fontWeight: 600, color: 'var(--green-700, #15803d)' }}>
                                  Net: {formatUsd(tx.metadata.net_payout)}
                                </span>
                              </div>
                            </div>
                          )}
                          {tx.metadata.settlement_id && tx.tx_type !== 'settlement_credit' && <div className={styles.metaItem}><span className={styles.metaLabel}>Settlement:</span> {tx.metadata.settlement_id.substring(0, 8)}...</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
                {hasMore && (
                  <div className={styles.loadMore}>
                    <button className={styles.loadMoreBtn} onClick={() => fetchTransactions(transactions.length, true)} disabled={loadingMore}>
                      {loadingMore ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Unsettled Tab ── */}
        {tab === 'pending' && (
          <>
            <div className={styles.infoBox}>
              <strong>⏳ Unsettled Transactions</strong>
              <p>These orders are awaiting the next market clearance. Once the market closes and netting is complete, they&apos;ll appear in your Activity tab.</p>
            </div>
            {pending.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>✅</span>
                <p>No unsettled transactions — everything has been cleared!</p>
              </div>
            ) : (
              <div className={styles.txList}>
                {pending.map(tx => {
                  const iconCfg = TX_ICONS[tx.tx_type] || { icon: '📄', cls: '' }
                  const isCredit = tx.direction === 'credit'
                  return (
                    <div key={tx.tx_id} className={styles.txRow} onClick={() => openReceipt(tx)}>
                      <div className={styles.txLeft}>
                        <div className={`${styles.txIcon} ${iconCfg.cls}`}>{iconCfg.icon}</div>
                        <div className={styles.txInfo}>
                          <span className={styles.txTitle}>{tx.description}</span>
                          <span className={styles.txSub}>
                            {new Date(tx.tx_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {tx.counterparty ? ` • ${tx.counterparty}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className={styles.txRight}>
                        <span className={`${styles.txAmount} ${isCredit ? styles.txAmountCredit : styles.txAmountDebit}`}>
                          {isCredit ? '+' : '-'}{formatUsd(tx.amount)}
                        </span>
                        <div className={styles.txStatus}>{tx.status}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── Summary Tab ── */}
        {tab === 'summary' && summary && (
          <>
            {/* Breakdown */}
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Financial Breakdown</h3>
              {[
                { label: 'Gross Sales', value: summary.total_sales, color: 'var(--green-700)', prefix: '+' },
                { label: 'Platform Fees', value: summary.total_fees, color: 'var(--amber-700)', prefix: '-' },
                { label: 'Refunds Issued', value: summary.refunds_issued, color: 'var(--red-600)', prefix: '-' },
                { label: 'Refunds Received', value: summary.refunds_received, color: 'var(--green-600)', prefix: '+' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--gray-50)' }}>
                  <span style={{ fontSize: 14, color: 'var(--gray-600)' }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: row.color }}>{row.prefix}{formatUsd(row.value)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '2px solid var(--gray-200)', marginTop: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Net Earnings</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-700)' }}>{formatUsd(summary.net_earnings)}</span>
              </div>
            </div>

            {/* Purchase breakdown */}
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Spending</h3>
              {[
                { label: 'Purchases', value: summary.total_purchases, count: summary.purchase_count },
                { label: 'CC Charges (Netting)', value: summary.total_cc_charged },
                { label: 'Redeemed', value: summary.total_redeemed },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--gray-50)' }}>
                  <span style={{ fontSize: 14, color: 'var(--gray-600)' }}>
                    {row.label}{'count' in row && row.count ? ` (${row.count})` : ''}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' }}>{formatUsd(row.value)}</span>
                </div>
              ))}
            </div>

            {/* 1099 Tracker */}
            <div className={styles.taxTracker}>
              <div className={styles.taxHeader}>
                <strong>📋 1099 Threshold Tracker</strong>
                <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{formatUsd(ytdSales)} / {formatUsd(thresholdAmount)}</span>
              </div>
              <div className="progress-bar" style={{ marginBottom: 8 }}>
                <div className="progress-fill" style={{ width: `${progress1099}%`, background: approachingThreshold || thresholdBreached ? 'var(--amber-500)' : 'var(--green-500)' }} />
              </div>
              {(approachingThreshold || thresholdBreached) && (
                <div className={styles.taxWarning}>
                  {thresholdBreached ? '🚨' : '⚠️'} You{thresholdBreached ? "'ve reached" : "'re approaching"} the {userState || 'federal'} 1099-K reporting threshold ({formatUsd(thresholdAmount)}).
                  {thresholdBreached ? ' A 1099-K will be generated for this calendar year.' : ' A 1099-K will be generated if you exceed this amount.'}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                {userState ? `${userState} threshold` : 'Federal threshold'}: {formatUsd(thresholdAmount)}
                {thresholdMinTxns > 0 ? ` • Min transactions: ${thresholdMinTxns}` : ''}
              </div>
            </div>

            {/* Netting explanation */}
            <div className={styles.infoBox}>
              <strong>💡 How Netting Works</strong>
              <p>At market close, all your transactions are netted together. Only the net amount is charged or credited, minimizing credit card processing fees. Sellers receive funds once delivery is confirmed.</p>
            </div>
          </>
        )}
      </div>

      {/* Receipt Sheet */}
      {receiptData && (
        <MarketReceiptSheet visible data={receiptData} onClose={() => setReceiptData(null)} />
      )}
    </div>
  )
}
