'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Auth callback page — forwards the PKCE code to the server-side
 * Route Handler at /api/auth/callback for exchange.
 * 
 * This page exists because:
 * 1. Cached login pages may still redirect here
 * 2. Native apps use this URL with ?native=true
 * 3. The Supabase dashboard has this URL as an allowed redirect
 */
function AuthCallbackInner() {
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    // Forward the code to the server-side route handler
    const code = searchParams.get('code')
    const redirect = searchParams.get('redirect') || '/market'
    const isNative = searchParams.get('native') === 'true'

    if (code) {
      // Redirect to server-side handler which exchanges the code
      // without navigator.locks issues
      const serverUrl = `/api/auth/callback?code=${encodeURIComponent(code)}&redirect=${encodeURIComponent(redirect)}${isNative ? '&native=true' : ''}`
      window.location.replace(serverUrl)
    } else {
      setError('No authentication code found. Please try logging in again.')
    }
  }, [searchParams])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px', width: '90%' }}>
        {error ? (
          <>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
            <h2 style={{ color: '#ef4444', marginBottom: '8px', fontSize: '20px', fontWeight: 600 }}>Login Failed</h2>
            <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>{error}</p>
            <a 
              href="/login" 
              style={{ background: 'var(--green-600, #16a34a)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, textDecoration: 'none' }}
            >
              Back to Login
            </a>
          </>
        ) : (
          <>
            <div style={{ border: '4px solid #f3f3f3', borderTop: '4px solid var(--green-600, #16a34a)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>Finalizing login...</h2>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>Please keep this window open.</p>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </>
        )}
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <AuthCallbackInner />
    </Suspense>
  )
}
