'use client'

import React, { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function ManageInterestContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const actionParam = searchParams.get('action')

  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'active' | 'paused' | 'deleted'>('active')
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null)
  
  // Mock lead data associated with token
  const [interestData, setInterestData] = useState({
    emailMasked: 'r***a@gmail.com',
    produceName: 'Meyer Lemons',
    interestType: 'buy',
    zipcodes: ['94025', '94027'],
    radiusMiles: 5,
  })

  const handleUpdateStatus = async (newStatus: 'active' | 'paused' | 'deleted') => {
    setLoading(true)
    try {
      const res = await fetch('/api/interest/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          status: newStatus,
        }),
      })
      setStatus(newStatus)
      if (newStatus === 'deleted') {
        setConfirmedMessage('Your produce interest alerts for Meyer Lemons have been turned off.')
      } else if (newStatus === 'paused') {
        setConfirmedMessage('Your produce interest alerts have been paused for 30 days.')
      } else {
        setConfirmedMessage('Your produce interest alerts are active.')
      }
    } catch {
      setStatus(newStatus)
      setConfirmedMessage(`Alerts updated to ${newStatus}.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.pageRoot}>
      <header style={styles.navHeader}>
        <div style={styles.navContainer}>
          <Link href="/interest" style={styles.logoLink}>
            <span style={{ fontSize: '24px', marginRight: '6px' }}>🌱</span>
            <span style={styles.logoText}>CasaGrown Security & Alerts</span>
          </Link>
        </div>
      </header>

      <main style={styles.container}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.shieldIcon}>🛡️</div>
            <h1 style={styles.title}>Manage Produce Alerts</h1>
            <p style={styles.subTitle}>
              Target Account: <strong>{interestData.emailMasked}</strong>
            </p>
          </div>

          <div style={styles.detailsBox}>
            <div style={styles.detailRow}>
              <span>Produce Item:</span>
              <strong>🍋 {interestData.produceName} ({interestData.interestType.toUpperCase()})</strong>
            </div>
            <div style={styles.detailRow}>
              <span>Target Zipcodes:</span>
              <strong>📍 {interestData.zipcodes.join(', ')} ({interestData.radiusMiles} mi radius)</strong>
            </div>
            <div style={styles.detailRow}>
              <span>Current Alert Status:</span>
              <span style={{
                ...styles.statusBadge,
                backgroundColor: status === 'active' ? '#dcfce7' : status === 'paused' ? '#fef3c7' : '#fee2e2',
                color: status === 'active' ? '#15803d' : status === 'paused' ? '#b45309' : '#b91c1c',
              }}>
                {status.toUpperCase()}
              </span>
            </div>
          </div>

          {confirmedMessage && (
            <div style={styles.alertBanner}>
              ✅ {confirmedMessage}
            </div>
          )}

          {/* Security Verification Notice */}
          <div style={styles.securityNotice}>
            🔒 <strong>Anti-Forwarding Protection:</strong> To prevent accidental unsubscriptions 
            from forwarded emails or bot link scanners, please confirm your choice below.
          </div>

          <div style={styles.actionRow}>
            {status !== 'active' ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleUpdateStatus('active')}
                style={styles.btnReactivate}
              >
                🟢 Re-activate Produce Alerts
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleUpdateStatus('paused')}
                  style={styles.btnPause}
                >
                  ⏸️ Pause Alerts for 30 Days
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleUpdateStatus('deleted')}
                  style={styles.btnDelete}
                >
                  🗑️ Confirm Turn Off Interest
                </button>
              </>
            )}
          </div>

          <div style={styles.footerLinkRow}>
            <Link href="/interest" style={styles.backLink}>
              ← Return to Produce Interests Page
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function ManageInterestPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Loading alert management...</div>}>
      <ManageInterestContent />
    </Suspense>
  )
}

const styles: Record<string, React.CSSProperties> = {
  pageRoot: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  navHeader: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 24px',
  },
  navContainer: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  logoLink: {
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#14532d',
  },
  container: {
    maxWidth: '540px',
    margin: '48px auto',
    padding: '0 20px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    padding: '32px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
    border: '1px solid #e5e7eb',
  },
  cardHeader: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  shieldIcon: {
    fontSize: '40px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#111827',
    margin: '0 0 6px 0',
  },
  subTitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  detailsBox: {
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '14px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#4b5563',
  },
  statusBadge: {
    padding: '2px 8px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  securityNotice: {
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1e40af',
    fontSize: '13px',
    padding: '12px',
    borderRadius: '10px',
    marginBottom: '24px',
    lineHeight: 1.4,
  },
  alertBanner: {
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#15803d',
    padding: '12px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '20px',
    textAlign: 'center',
  },
  actionRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  btnPause: {
    backgroundColor: '#fffbeb',
    color: '#b45309',
    border: '1px solid #fde68a',
    padding: '12px',
    borderRadius: '10px',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
  },
  btnDelete: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    padding: '12px',
    borderRadius: '10px',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
  },
  btnReactivate: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    padding: '12px',
    borderRadius: '10px',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
  },
  footerLinkRow: {
    marginTop: '24px',
    textAlign: 'center',
  },
  backLink: {
    color: '#16a34a',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
  },
}
