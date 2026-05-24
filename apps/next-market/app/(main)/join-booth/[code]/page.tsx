'use client'


import { useState, useEffect , Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../../../lib/useAuth'
import { createClient } from '../../../../lib/supabase'
import { useMarket } from '../../../../lib/store'
import { useNotificationPrompt } from '../../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../../../components/NotificationPromptModal'
import styles from './page.module.css'



type BoothInfo = {
  id: string
  name: string
  ownerName: string
  theme: string
  headerImageUrl?: string
}

type PageState = 'loading' | 'enter-passcode' | 'confirm' | 'success' | 'declined' | 'error'

function JoinBoothPageInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const { dispatch } = useMarket()
  const supabase = createClient()
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)

  const code = decodeURIComponent(params.code as string)



  // State
  const [pageState, setPageState] = useState<PageState>('loading')
  const [booth, setBooth] = useState<BoothInfo | null>(null)
  const [passcode, setPasscode] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [processing, setProcessing] = useState(false)

  // Pre-fill passcode from URL code if it contains a passcode segment
  // Format from get-started: "PREFIX-PASSCODE" — use the PASSCODE portion
  // Format from my-booth: just the raw passcode
  const extractPasscode = (urlCode: string) => {
    if (urlCode.includes('-')) {
      // get-started format: PREFIX-PASSCODE
      const parts = urlCode.split('-')
      return parts[parts.length - 1]
    }
    return urlCode
  }

  // Check auth and load booth info
  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated) {
      // Redirect to login with redirect back to this page
      const currentPath = `/join-booth/${encodeURIComponent(code)}`
      router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`)
      return
    }

    // Pre-fill passcode from URL
    const prefilledPasscode = extractPasscode(code)
    if (prefilledPasscode) {
      setPasscode(prefilledPasscode)
    }

    // Try to look up the booth by passcode
    const lookupBooth = async () => {
      const testPasscode = prefilledPasscode || code
      
      const { data: boothData, error } = await supabase
        .from('market_booths')
        .select('id, name, owner_id, decorative_theme, header_image_url, profiles!market_booths_owner_id_fkey(full_name)')
        .eq('helper_passcode', testPasscode)
        .single()

      if (error || !boothData) {
        // Passcode not found — let user enter manually
        setPageState('enter-passcode')
        return
      }

      const ownerProfile = (boothData as any).profiles
      setBooth({
        id: boothData.id,
        name: boothData.name || 'Unnamed Booth',
        ownerName: ownerProfile?.full_name || 'A seller',
        theme: boothData.decorative_theme || 'minimal',
        headerImageUrl: boothData.header_image_url || undefined,
      })
      setPasscode(testPasscode)
      setPageState('confirm')
    }

    lookupBooth()
  }, [authLoading, isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Look up booth when user submits a passcode
  const handleLookup = async () => {
    if (!passcode.trim()) return
    setProcessing(true)
    setErrorMsg('')

    const { data: boothData, error } = await supabase
      .from('market_booths')
      .select('id, name, owner_id, decorative_theme, header_image_url, profiles!market_booths_owner_id_fkey(full_name)')
      .eq('helper_passcode', passcode.trim().toUpperCase())
      .single()

    if (error || !boothData) {
      setErrorMsg('Invalid passcode. Please check the code and try again.')
      setProcessing(false)
      return
    }

    // Check if user is the booth owner
    if (boothData.owner_id === user?.id) {
      setErrorMsg('You can\'t join your own booth as a helper.')
      setProcessing(false)
      return
    }

    const ownerProfile = (boothData as any).profiles
    setBooth({
      id: boothData.id,
      name: boothData.name || 'Unnamed Booth',
      ownerName: ownerProfile?.full_name || 'A seller',
      theme: boothData.decorative_theme || 'minimal',
      headerImageUrl: boothData.header_image_url || undefined,
    })
    setProcessing(false)
    setPageState('confirm')
  }

  // Accept helper role
  const handleAccept = async () => {
    setProcessing(true)
    setErrorMsg('')

    try {
      const { data, error } = await supabase.rpc('join_booth_as_helper', { p_passcode: passcode.trim().toUpperCase() })

      if (error) {
        if (error.message.includes('Cannot be helper of your own booth')) {
          setErrorMsg('You can\'t join your own booth as a helper.')
        } else if (error.message.includes('Invalid passcode')) {
          setErrorMsg('This passcode is invalid or has expired. Ask the booth owner for a new one.')
        } else {
          setErrorMsg(error.message)
        }
        setProcessing(false)
        return
      }

      setPageState('success')
      dispatch({ type: 'ADD_TOAST', payload: { message: '🎉 You\'re now a booth helper!', type: 'success' } })
      showPrompt() // Prompt for push notifications — they'll want order alerts
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong')
    }
    setProcessing(false)
  }

  // Decline helper role
  const handleDecline = () => {
    setPageState('declined')
  }

  // Theme colors for booth preview
  const themeColors: Record<string, { bg: string; border: string; text: string }> = {
    rustic:   { bg: '#fef3c7', border: '#f59e0b', text: '#78350f' },
    tropical: { bg: '#d1fae5', border: '#10b981', text: '#064e3b' },
    minimal:  { bg: '#f3f4f6', border: '#6b7280', text: '#1f2937' },
    floral:   { bg: '#fce7f3', border: '#ec4899', text: '#831843' },
    harvest:  { bg: '#fef3c7', border: '#d97706', text: '#78350f' },
    cottage:  { bg: '#e0f2fe', border: '#0ea5e9', text: '#0c4a6e' },
  }
  const tc = themeColors[booth?.theme || 'minimal'] || themeColors.minimal

  // Loading state
  if (authLoading || pageState === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.loadingSpinner} />
          <p className={styles.loadingText}>Loading invitation...</p>
        </div>
      </div>
    )
  }

  // Enter passcode manually
  if (pageState === 'enter-passcode') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.headerIcon}>🤝</div>
          <h1 className={styles.title}>Join a Booth</h1>
          <p className={styles.subtitle}>Enter the passcode shared by the booth owner to join as a helper.</p>

          {errorMsg && <div className={styles.errorBanner}>{errorMsg}</div>}

          <div className={styles.passcodeInputWrap}>
            <input
              id="passcode"
              className={styles.passcodeInput}
              type="text"
              value={passcode}
              onChange={e => { setPasscode(e.target.value.toUpperCase()); setErrorMsg('') }}
              placeholder="ABCDEF"
              maxLength={10}
              autoFocus
            />
          </div>

          <button
            className={`btn btn-primary btn-lg ${styles.actionBtn}`}
            onClick={handleLookup}
            disabled={processing || passcode.trim().length < 4}
          >
            {processing ? 'Looking up...' : 'Find Booth →'}
          </button>

          <button className={styles.backLink} onClick={() => router.push('/market')}>
            ← Back to Market
          </button>
        </div>
      </div>
    )
  }

  // Confirm accept/reject
  if (pageState === 'confirm' && booth) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.headerIcon}>🤝</div>
          <h1 className={styles.title}>You&apos;re Invited!</h1>
          <p className={styles.subtitle}>
            <strong>{booth.ownerName}</strong> has invited you to help manage their booth.
          </p>

          {/* Booth preview card */}
          <div className={styles.boothPreview} style={{ background: tc.bg, borderColor: tc.border }}>
            {booth.headerImageUrl && (
              <div
                className={styles.boothPreviewBanner}
                style={{ backgroundImage: `url(${booth.headerImageUrl})` }}
              />
            )}
            <div className={styles.boothPreviewBody}>
              <h3 className={styles.boothPreviewName} style={{ color: tc.text }}>{booth.name}</h3>
              <p className={styles.boothPreviewOwner}>by {booth.ownerName}</p>
            </div>
          </div>

          <div className={styles.helperPerks}>
            <h4>As a helper, you can:</h4>
            <ul>
              <li>📦 Add and manage products</li>
              <li>📋 View and manage orders</li>
              <li>💬 Communicate with buyers</li>
            </ul>
          </div>

          {errorMsg && <div className={styles.errorBanner}>{errorMsg}</div>}

          <div className={styles.actionBtnGroup}>
            <button
              className={`btn btn-primary btn-lg ${styles.acceptBtn}`}
              onClick={handleAccept}
              disabled={processing}
            >
              {processing ? 'Joining...' : '✅ Accept & Join'}
            </button>
            <button
              className={`btn btn-outline ${styles.declineBtn}`}
              onClick={handleDecline}
              disabled={processing}
            >
              ✕ Decline
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Success
  if (pageState === 'success') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successIcon}>🎉</div>
          <h1 className={styles.title}>You&apos;re In!</h1>
          <p className={styles.subtitle}>
            You&apos;re now a helper for <strong>{booth?.name}</strong>. You can manage products and orders for this booth.
          </p>

          <button
            className={`btn btn-primary btn-lg ${styles.actionBtn}`}
            onClick={() => router.push('/helping')}
          >
            Go to My Helping Booths →
          </button>
          <button className={styles.backLink} onClick={() => router.push('/market')}>
            Browse Market
          </button>
          <NotificationPromptModal {...modalProps} />
        </div>
      </div>
    )
  }

  // Declined
  if (pageState === 'declined') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.headerIcon}>👋</div>
          <h1 className={styles.title}>No Problem!</h1>
          <p className={styles.subtitle}>
            You&apos;ve declined the invitation to help with <strong>{booth?.name}</strong>.
            You can always join later if you change your mind.
          </p>

          <button
            className={`btn btn-primary btn-lg ${styles.actionBtn}`}
            onClick={() => router.push('/market')}
          >
            Browse Market →
          </button>
        </div>
      </div>
    )
  }

  // Error fallback
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.headerIcon}>⚠️</div>
        <h1 className={styles.title}>Something Went Wrong</h1>
        <p className={styles.subtitle}>{errorMsg || 'Unable to load the invitation.'}</p>
        <button
          className={`btn btn-primary btn-lg ${styles.actionBtn}`}
          onClick={() => router.push('/market')}
        >
          Go to Market →
        </button>
      </div>
    </div>
  )
}

export default function JoinBoothPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <JoinBoothPageInner />
    </Suspense>
  )
}
