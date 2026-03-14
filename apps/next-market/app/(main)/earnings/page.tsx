'use client'

import Link from 'next/link'
import { useMarket, formatUsd } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'
import styles from './page.module.css'

export default function EarningsPage() {
  const { state } = useMarket()
  const { earnings } = state

  const { isAuthenticated, loading: authLoading } = useAuth()

  if (authLoading) return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>

  if (!isAuthenticated) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><h2>Sign in to view earnings</h2><Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link></div>
  }

  // 1099 thresholds
  const federalThreshold = 600
  const stateThreshold = 200 // CA
  const progress1099 = Math.min(100, (earnings.totalSales / federalThreshold) * 100)
  const approaching = earnings.totalSales >= federalThreshold * 0.8

  return (
    <div className="container">
      <div className="page-header"><h1 className="page-title">Earnings</h1><p className="page-subtitle">Your market sales and payouts</p></div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard} style={{ borderColor: 'var(--green-300)' }}>
          <span className={styles.summaryLabel}>Available</span>
          <span className={styles.summaryValue} style={{ color: 'var(--green-700)' }}>{formatUsd(earnings.available)}</span>
          <Link href="/earnings/redeem" className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>Redeem →</Link>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Pending (Today)</span>
          <span className={styles.summaryValue}>{formatUsd(earnings.pending)}</span>
          <span className={styles.summaryHint}>Netted at market close</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Total Sales</span>
          <span className={styles.summaryValue}>{formatUsd(earnings.totalSales)}</span>
          <span className={styles.summaryHint}>{earnings.salesCount} orders</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Redeemed</span>
          <span className={styles.summaryValue}>{formatUsd(earnings.redeemed)}</span>
        </div>
      </div>

      {/* Netting Explanation */}
      <div className={styles.infoBox}>
        <strong>💡 How Netting Works</strong>
        <p>At market close, all your transactions are netted together. Only the net amount is charged or credited, minimizing credit card processing fees. Sellers receive funds once delivery is confirmed.</p>
      </div>

      {/* 1099 Tracker */}
      <div className={styles.taxTracker}>
        <div className={styles.taxHeader}>
          <strong>📋 1099 Threshold Tracker</strong>
          <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{formatUsd(earnings.totalSales)} / {formatUsd(federalThreshold)}</span>
        </div>
        <div className="progress-bar" style={{ marginBottom: 8 }}>
          <div className="progress-fill" style={{ width: `${progress1099}%`, background: approaching ? 'var(--amber-500)' : 'var(--green-500)' }} />
        </div>
        {approaching && (
          <div className={styles.taxWarning}>
            ⚠️ You&apos;re approaching the federal 1099 reporting threshold ({formatUsd(federalThreshold)}). A 1099-K will be generated if you exceed this amount.
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
          CA state threshold: {formatUsd(stateThreshold)} • Federal threshold: {formatUsd(federalThreshold)}
        </div>
      </div>

      {/* Transaction History */}
      <div className={styles.historySection}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Recent Transactions</h2>
        <div className={styles.historyList}>
          {state.orders.filter(o => o.sellerId === state.user?.id || o.buyerId === state.user?.id).slice(0, 10).map(o => (
            <div key={o.id} className={styles.historyRow}>
              <div>
                <strong style={{ fontSize: 13 }}>{o.boothName}</strong>
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {new Date(o.createdAt).toLocaleDateString()} • {o.items.map(i => i.productName).join(', ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="price" style={{ fontSize: 14 }}>
                  {o.sellerId === state.user?.id ? '+' : '-'}{formatUsd(o.total)}
                </span>
                <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{o.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
