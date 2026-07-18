'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase'

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Finalizing login...')
  const [error, setError] = useState('')
  const [deepLink, setDeepLink] = useState('')

  useEffect(() => {
    const supabase = createClient()
    const hasNativeCookie = typeof document !== 'undefined' && document.cookie.includes('is_native_auth=true')
    const isNative = searchParams.get('native') === 'true' || 
      (typeof window !== 'undefined' && window.sessionStorage.getItem('is_native_auth') === 'true') ||
      hasNativeCookie

    const redirectPath = searchParams.get('redirect') || '/market'

    const handleSession = (session: any) => {
      if (isNative) {
        setStatus('Returning to app...')
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem('is_native_auth')
          document.cookie = "is_native_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
        }
        const accessToken = session.access_token
        const refreshToken = session.refresh_token
        const dl = `casagrown://auth-callback?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`
        setDeepLink(dl)
        window.location.href = dl
      } else {
        router.replace(redirectPath)
      }
    }

    const exchangeAndRedirect = async () => {
      try {
        // 1. Try explicit PKCE code exchange first
        const code = new URL(window.location.href).searchParams.get('code')
        if (code) {
          console.log('[auth-callback] Exchanging PKCE code...')
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('[auth-callback] Code exchange failed:', exchangeError.message)
            // Code might already be exchanged — fall through to getSession
          } else if (data?.session) {
            console.log('[auth-callback] Code exchange succeeded')
            handleSession(data.session)
            return
          }
        }

        // 2. Check if session already exists (e.g. code was auto-exchanged)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          console.log('[auth-callback] Session found via getSession')
          handleSession(session)
          return
        }

        // 3. Last resort: listen for auth state changes
        console.log('[auth-callback] No session yet, waiting for onAuthStateChange...')
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: any, newSession: any) => {
          if (newSession) {
            subscription.unsubscribe()
            handleSession(newSession)
          }
        })

        // Safety timeout
        const timeout = setTimeout(() => {
          subscription.unsubscribe()
          setError('Authentication timed out. Please try logging in again.')
        }, 15000)

        return () => {
          subscription.unsubscribe()
          clearTimeout(timeout)
        }
      } catch (err: any) {
        console.error('[auth-callback] Error:', err)
        setError(err?.message || 'Failed to complete login')
      }
    }

    exchangeAndRedirect()
  }, [searchParams, router])

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
