'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../../lib/useAuth'
import { createClient } from '../../../../../lib/supabase'
import { LoadingSpinner } from '../../../../components/LoadingSpinner'
import styles from './page.module.css'

type OnboardingState = 'polling' | 'success' | 'still_processing' | 'error'

export default function StripeCallbackPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const userId = user?.id
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [state, setState] = useState<OnboardingState>('polling')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pollCount, setPollCount] = useState(0)

  // Fetch and check onboarding status
  const checkStatus = useCallback(async () => {
    if (!userId) return false

    try {
      const { data, error } = await supabase.rpc('get_profile_stripe_connect_info')
      if (error) {
        console.error('[STRIPE-CALLBACK] Error getting stripe info:', error)
        return false
      }

      if (data && data.length > 0) {
        const { stripe_onboarding_completed, stripe_connect_active } = data[0]
        console.log(`[STRIPE-CALLBACK] Polling result: completed=${stripe_onboarding_completed}, active=${stripe_connect_active}`)
        
        if (stripe_onboarding_completed) {
          setState('success')
          // Force make active if not already done by webhook
          if (!stripe_connect_active) {
            await supabase.rpc('set_stripe_connect_active', { p_active: true })
          }
          return true
        }
      }
      return false
    } catch (err) {
      console.error('[STRIPE-CALLBACK] Catch error checking status:', err)
      return false
    }
  }, [userId, supabase])

  // Polling loop
  useEffect(() => {
    if (authLoading || !isAuthenticated || !userId) return

    let active = true
    let timerId: any

    const runPoll = async () => {
      if (!active) return

      const isCompleted = await checkStatus()
      if (isCompleted) {
        return
      }

      if (pollCount >= 5) {
        // Timed out, still processing
        setState('still_processing')
        return
      }

      // Schedule next poll in 1.5s
      timerId = setTimeout(() => {
        if (active) {
          setPollCount(prev => prev + 1)
        }
      }, 1500)
    }

    runPoll()

    return () => {
      active = false
      clearTimeout(timerId)
    }
  }, [isAuthenticated, authLoading, userId, checkStatus, pollCount])

  if (authLoading) return <LoadingSpinner />

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <div className={`${styles.card} ${styles.errorCard}`}>
          <div className={`${styles.iconWrapper} ${styles.errorIcon}`}>⚠️</div>
          <h2 className={styles.title}>Authentication Required</h2>
          <p className={styles.description}>Please sign in to link your Stripe account.</p>
          <Link href="/login" className={`${styles.btn} ${styles.btnPrimary}`}>Sign In</Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {state === 'polling' && (
        <div className={`${styles.card} ${styles.pendingCard}`}>
          <div className={styles.spinner} />
          <h2 className={styles.title}>Connecting Stripe...</h2>
          <p className={styles.description}>
            We are securing your bank connection details with Stripe. This takes just a moment...
          </p>
          <button 
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={() => router.push('/earnings/payout')}
          >
            Skip waiting & go to Wallet
          </button>
        </div>
      )}

      {state === 'success' && (
        <div className={`${styles.card} ${styles.successCard}`}>
          <div className={`${styles.iconWrapper} ${styles.successIcon}`}>🎉</div>
          <h2 className={styles.title}>Stripe Connected!</h2>
          <p className={styles.description}>
            Your Standard Stripe account is successfully linked. Direct payouts are now active! All future settlements will bypass your virtual wallet and deposit directly to your bank via ACH.
          </p>
          <Link href="/earnings/payout" className={`${styles.btn} ${styles.btnPrimary}`}>
            Go to Wallet
          </Link>
          <Link href="/earnings" className={`${styles.btn} ${styles.btnSecondary}`}>
            View Earnings Dashboard
          </Link>
        </div>
      )}

      {state === 'still_processing' && (
        <div className={`${styles.card} ${styles.pendingCard}`}>
          <div className={`${styles.iconWrapper} ${styles.pendingIcon}`}>⏳</div>
          <h2 className={styles.title}>Setup In Progress</h2>
          <p className={styles.description}>
            Stripe is still verifying your onboarding details. Direct deposits will activate automatically once Stripe finishes processing. You can check your progress in your Wallet at any time.
          </p>
          <Link href="/earnings/payout" className={`${styles.btn} ${styles.btnPrimary}`}>
            Go back to Wallet
          </Link>
        </div>
      )}

      {state === 'error' && (
        <div className={`${styles.card} ${styles.errorCard}`}>
          <div className={`${styles.iconWrapper} ${styles.errorIcon}`}>❌</div>
          <h2 className={styles.title}>Connection Failed</h2>
          <p className={styles.description}>
            {errorMessage || "We couldn't connect your Stripe account. Please check your details and try again."}
          </p>
          <Link href="/earnings/payout" className={`${styles.btn} ${styles.btnPrimary}`}>
            Try again in Wallet
          </Link>
        </div>
      )}
    </div>
  )
}
