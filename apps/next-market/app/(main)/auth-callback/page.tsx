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

    // Manually extract tokens from hash fragment as a fallback — try setSession
    // but if it fails, fall through to the normal getSession check which relies
    // on Supabase's auto-detection.
    const hash = typeof window !== 'undefined' ? window.location.hash.substring(1) : ''
    const hashParams = new URLSearchParams(hash)
    const hashAccessToken = hashParams.get('access_token')
    const hashRefreshToken = hashParams.get('refresh_token')

    const checkSession = async () => {
      try {
        // Best-effort: try setting session from hash tokens explicitly
        if (hashAccessToken && hashRefreshToken) {
          await supabase.auth.setSession({
            access_token: hashAccessToken,
            refresh_token: hashRefreshToken,
          }).catch(() => {}) // Ignore errors — fall through to getSession
        }

        const { data: { session } } = await supabase.auth.getSession()
        const redirectPath = searchParams.get('redirect') || '/market'
        if (session) {
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
        } else {
          // If no session found immediately, listen to auth state changes
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: any, newSession: any) => {
            if (newSession) {
              subscription.unsubscribe()
              if (isNative) {
                setStatus('Returning to app...')
                if (typeof window !== 'undefined') {
                  window.sessionStorage.removeItem('is_native_auth')
                  document.cookie = "is_native_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
                }
                const accessToken = newSession.access_token
                const refreshToken = newSession.refresh_token
                const dl = `casagrown://auth-callback?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`
                setDeepLink(dl)
                window.location.href = dl
              } else {
                router.replace(redirectPath)
              }
            }
          })

          // Safety timeout (10 seconds)
          const timeout = setTimeout(() => {
            subscription.unsubscribe()
            setError('Authentication timed out. Please try logging in again.')
          }, 10000)

          return () => clearTimeout(timeout)
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to complete login')
      }
    }

    checkSession()
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
