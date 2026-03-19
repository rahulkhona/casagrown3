'use client'

import { MarketProvider } from '../../lib/store'
import { useAuth } from '../../lib/useAuth'
import { Navbar } from '../components/Navbar'
import { BottomNav } from '../components/BottomNav'
import { RatingReminder } from '../components/RatingReminder'
import { AnalyticsTracker } from '../components/AnalyticsTracker'
import { ErrorToastProvider } from '../components/ErrorToast'

function BannedOverlay({ reason }: { reason: string | null }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32,
        maxWidth: 420, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🚫</div>
        <h2 style={{ margin: '0 0 12px', fontSize: 22, color: '#dc2626' }}>Account Suspended</h2>
        <p style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 16px' }}>
          Your account has been suspended and you cannot access CasaGrown Market at this time.
        </p>
        {reason && (
          <p style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            padding: 12, fontSize: 13, color: '#991b1b', margin: '0 0 16px',
          }}>
            <strong>Reason:</strong> {reason}
          </p>
        )}
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          If you believe this is an error, please contact support at{' '}
          <a href="mailto:support@casagrown.com" style={{ color: '#2563eb' }}>support@casagrown.com</a>
        </p>
      </div>
    </div>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { isBanned, banReason, user } = useAuth()

  return (
    <MarketProvider>
      <ErrorToastProvider userId={user?.id}>
        <AnalyticsTracker />
        <Navbar />
        <main className="page-wrapper">
          {children}
        </main>
        <BottomNav />
        <RatingReminder />
        {isBanned && <BannedOverlay reason={banReason} />}
      </ErrorToastProvider>
    </MarketProvider>
  )
}

