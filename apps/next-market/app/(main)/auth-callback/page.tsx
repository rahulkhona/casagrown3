'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { supabase } from '@casagrown/app/features/auth/auth-hook'

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const [status, setStatus] = useState('Finalizing login...')
  const [error, setError] = useState('')
  const [deepLink, setDeepLink] = useState('')
  const [handled, setHandled] = useState(false)

  const hasNativeCookie = typeof document !== 'undefined' && document.cookie.includes('is_native_auth=true')
  const isNative = searchParams.get('native') === 'true' || 
    (typeof window !== 'undefined' && window.sessionStorage.getItem('is_native_auth') === 'true') ||
    hasNativeCookie

  const redirectPath = searchParams.get('redirect') || '/market'

  // The shared AuthProvider client (which has detectSessionInUrl: true)
  // will automatically detect the ?code= parameter and exchange it.
  // We just wait for the user to appear in the auth context.
  useEffect(() => {
    if (handled) return
    if (loading) return // still exchanging the PKCE code

    if (user) {
      setHandled(true)
      if (isNative) {
        setStatus('Returning to app...')
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem('is_native_auth')
          document.cookie = "is_native_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
        }
        // Get fresh session for tokens
        supabase.auth.getSession().then(({ data: { session } }: any) => {
          if (session) {
            const accessToken = session.access_token
            const refreshToken = session.refresh_token
            const dl = `casagrown://auth-callback?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`
            setDeepLink(dl)
            window.location.href = dl
          }
        })
      } else {
        router.replace(redirectPath)
      }
    }
  }, [user, loading, handled, isNative, redirectPath, router, supabase])

  // Safety timeout — if auth exchange takes too long, show error
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!user && !handled) {
        setError('Authentication timed out. Please try logging in again.')
      }
    }, 15000)
    return () => clearTimeout(timeout)
  }, [user, handled])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px', width: '90%' }}>
        {error ? (
          <>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
            <h2 style={{ color: '#ef4444', marginBottom: '8px', fontSize: '20px', fontWeight: 600 }}>Login Failed</h2>
            <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>{error}</p>
            <button 
              onClick={() => router.replace('/login')} 
              style={{ background: 'var(--green-600, #16a34a)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
            >
              Back to Login
            </button>
          </>
        ) : (
          <>
            {!deepLink && (
              <div style={{ border: '4px solid #f3f3f3', borderTop: '4px solid var(--green-600, #16a34a)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }} />
            )}
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>{status}</h2>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>Please keep this window open.</p>
            
            {deepLink && (
              <a 
                href={deepLink} 
                style={{ 
                  display: 'inline-block', 
                  background: 'var(--green-600, #16a34a)', 
                  color: '#fff', 
                  textDecoration: 'none', 
                  padding: '12px 24px', 
                  borderRadius: '8px', 
                  fontSize: '14px', 
                  fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)'
                }}
              >
                Tap to Return to App
              </a>
            )}

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
