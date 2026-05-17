'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { useMarket } from '../../../lib/store'

interface PreflightData {
  open_orders: number
  available_usd: number
  pending_usd: number
  active_disputes: number
  queued_payouts: number
  has_pending_business: boolean
  has_community_footprint: boolean
  is_fast_path: boolean
}

export default function DeleteAccountPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { dispatch } = useMarket()
  const supabase = createClient()
  const [preflight, setPreflight] = useState<PreflightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    const fetchPreflight = async () => {
      const { data, error } = await supabase.rpc('get_closure_preflight', {
        p_user_id: user.id
      })
      if (error) {
        setError('Failed to check account status')
      } else {
        setPreflight(data)
      }
      setLoading(false)
    }
    fetchPreflight()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return
    setDeleting(true)
    setError('')

    try {
      // Try getSession first; if the Supabase client hasn't hydrated yet,
      // fall back to reading the token directly from localStorage.
      let accessToken: string | null = null
      const { data: { session } } = await supabase.auth.getSession()
      accessToken = session?.access_token ?? null

      if (!accessToken && typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('sb-127-auth-token')
            || localStorage.getItem('supabase.auth.token')
          if (raw) {
            const parsed = JSON.parse(raw)
            accessToken = parsed.access_token ?? null
          }
        } catch { /* ignore parse errors */ }
      }

      if (!accessToken) {
        setError('Please sign in again to delete your account.')
        setDeleting(false)
        return
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-account-closure`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      const result = await res.json()

      if (!res.ok || result.error) {
        setError(result.error || 'Failed to delete account')
        setDeleting(false)
        return
      }

      // Sign out, clear all session data, and redirect
      try { await supabase.auth.signOut() } catch { /* user is already deleted */ }
      dispatch({ type: 'LOGOUT' })

      // Clear all auth tokens from localStorage AND cookies
      if (typeof window !== 'undefined') {
        // localStorage
        Object.keys(localStorage).forEach(key => {
          if (key.includes('supabase') || key.includes('sb-')) {
            localStorage.removeItem(key)
          }
        })
        // sessionStorage
        Object.keys(sessionStorage).forEach(key => {
          if (key.includes('supabase') || key.includes('sb-')) {
            sessionStorage.removeItem(key)
          }
        })
        // Cookies — expire all supabase/sb- cookies
        document.cookie.split(';').forEach(c => {
          const name = c.trim().split('=')[0]
          if (name.includes('supabase') || name.includes('sb-')) {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`
          }
        })
      }

      // Use window.location for a hard redirect (clears Next.js client state entirely)
      window.location.href = '/delete-account/success'
    } catch {
      setError('Something went wrong. Please try again.')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="container-sm" style={{ padding: '40px 16px', textAlign: 'center' }}>
        <p style={{ color: 'var(--gray-500)' }}>Checking account status...</p>
      </div>
    )
  }

  return (
    <div className="container-sm" style={{ padding: '20px 16px', maxWidth: 520 }}>
      <div className="page-header">
        <h1 className="page-title" style={{ color: 'var(--red-600)' }}>🗑️ Delete Account</h1>
      </div>

      {/* Warning banner if pending business */}
      {preflight?.has_pending_business && (
        <div className="card" style={{
          padding: 16, marginBottom: 16,
          border: '1px solid var(--orange-300)',
          background: 'var(--orange-50)',
        }}>
          <strong style={{ color: 'var(--orange-700)', fontSize: 15 }}>
            ⚠️ You have pending transactions
          </strong>
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.6 }}>
            {preflight.open_orders > 0 && (
              <p>• <strong>{preflight.open_orders}</strong> open order(s) — will be automatically cancelled</p>
            )}
            {(preflight.available_usd > 0 || preflight.pending_usd > 0) && (
              <p>• <strong>${(preflight.available_usd + preflight.pending_usd).toFixed(2)}</strong> balance — will be paid out via your configured method, or mailed as a check</p>
            )}
            {preflight.active_disputes > 0 && (
              <p>• <strong>{preflight.active_disputes}</strong> unresolved dispute(s) — will be escalated to staff</p>
            )}
            {preflight.queued_payouts > 0 && (
              <p>• <strong>{preflight.queued_payouts}</strong> queued payout(s) — will be processed before account closure</p>
            )}
          </div>
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--orange-700)', fontWeight: 600 }}>
            Would you like to come back and delete your account once these are settled?
          </p>
          <button
            className="btn btn-outline"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => router.back()}
          >
            Come Back Later
          </button>
        </div>
      )}

      {/* What happens disclosure */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <strong style={{ fontSize: 15 }}>What happens when you delete your account:</strong>
        <ul style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.8, marginTop: 8, paddingLeft: 18 }}>
          {preflight?.is_fast_path ? (
            <>
              <li>Your profile and all associated data will be permanently removed</li>
              <li>You will be signed out immediately</li>
            </>
          ) : (
            <>
              <li>Your profile will be anonymized to &ldquo;Deleted User&rdquo;</li>
              <li>Your products will be removed from the marketplace</li>
              <li>Your community posts will remain but show as &ldquo;Deleted User&rdquo;</li>
              <li>Your DM conversations will become read-only for the other party</li>
              {preflight?.has_pending_business && (
                <>
                  {(preflight.open_orders > 0) && <li>Open orders will be cancelled</li>}
                  {(preflight.active_disputes > 0) && <li>Active disputes will be escalated to staff</li>}
                  {(preflight.available_usd > 0 || preflight.pending_usd > 0) && <li>Your remaining balance will be paid out</li>}
                </>
              )}
              <li>Your helper relationships will be terminated</li>
            </>
          )}
        </ul>
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 8,
          background: preflight?.is_fast_path ? 'var(--blue-50, #eff6ff)' : 'var(--red-50)',
          border: `1px solid ${preflight?.is_fast_path ? 'var(--blue-200, #bfdbfe)' : 'var(--red-200)'}`,
          fontSize: 13, color: preflight?.is_fast_path ? 'var(--blue-700, #1d4ed8)' : 'var(--red-700)', fontWeight: 600,
          lineHeight: 1.6,
        }}>
          {preflight?.is_fast_path
            ? '💡 Since your account has no activity history, it will be fully removed. You are welcome to re-register with the same email address at any time.'
            : '⚠️ This is permanent. Your data will be anonymized and your email address will be permanently locked — it cannot be used to create a new account.'}
        </div>
      </div>

      {/* Confirmation */}
      <div className="card" style={{ padding: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--gray-600)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
          Type <strong>DELETE</strong> to confirm:
        </label>
        <input
          data-testid="delete-confirm-input"
          type="text"
          className="input"
          placeholder="DELETE"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value.toUpperCase())}
          disabled={deleting}
          style={{ marginBottom: 12, fontFamily: 'monospace', letterSpacing: 2, textAlign: 'center' }}
        />

        {error && (
          <p style={{ color: 'var(--red-600)', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button
          data-testid="delete-account-btn"
          className="btn btn-danger"
          style={{ width: '100%' }}
          disabled={confirmText !== 'DELETE' || deleting}
          onClick={handleDelete}
        >
          {deleting ? 'Deleting account...' : 'Permanently Delete My Account'}
        </button>

        <button
          className="btn btn-outline"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => router.back()}
          disabled={deleting}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
