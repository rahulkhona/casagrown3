'use client'

import { useMarket } from '../../../lib/store'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const { state, dispatch } = useMarket()
  const router = useRouter()

  return (
    <div className="container-sm">
      <div className="page-header"><h1 className="page-title">Settings</h1></div>

      {/* Push Notifications */}
      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <strong style={{ fontSize: 15 }}>🔔 Push Notifications</strong>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>Receive alerts for orders, messages, and market openings</p>
          </div>
          <button
            className="switch active"
            onClick={() => dispatch({ type: 'ADD_TOAST', payload: { message: 'Push notifications enabled!', type: 'success' } })}
          />
        </div>
      </div>

      {/* PWA Install */}
      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <strong style={{ fontSize: 15 }}>📱 Install App</strong>
        <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2, marginBottom: 12 }}>
          Add CasaGrown Market to your home screen for the best experience.
        </p>
        <div style={{ fontSize: 13, color: 'var(--gray-600)', background: 'var(--gray-50)', padding: 14, borderRadius: 'var(--radius-lg)', lineHeight: 1.7 }}>
          <strong>iOS:</strong> Tap the Share button → &quot;Add to Home Screen&quot;<br />
          <strong>Android:</strong> Tap the ⋮ menu → &quot;Install app&quot;<br />
          <strong>Desktop:</strong> Click the install icon in the address bar
        </div>
      </div>

      {/* Account */}
      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <strong style={{ fontSize: 15 }}>👤 Account</strong>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => router.push('/profile')}>
            ✏️ Edit Profile
          </button>
          {state.isAuthenticated && (
            <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => {
              dispatch({ type: 'LOGOUT' })
              dispatch({ type: 'ADD_TOAST', payload: { message: 'Logged out', type: 'info' } })
              router.push('/')
            }}>
              🚪 Log Out
            </button>
          )}
        </div>
      </div>

      {/* Legal */}
      <div className="card" style={{ padding: 20, marginBottom: 40 }}>
        <strong style={{ fontSize: 15 }}>📄 Legal</strong>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--gray-500)', padding: '8px 0' }}>Terms of Service</span>
          <span style={{ fontSize: 13, color: 'var(--gray-500)', padding: '8px 0' }}>Privacy Policy</span>
          <span style={{ fontSize: 13, color: 'var(--gray-500)', padding: '8px 0' }}>Community Guidelines</span>
        </div>
      </div>
    </div>
  )
}
