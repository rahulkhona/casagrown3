'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { useQuickSetup } from '../../../lib/useQuickSetup'
import { createClient } from '../../../lib/supabase'
import {
  resetSessionId,
  trackEvent,
  trackFieldInteract,
  trackStepTiming,
} from '../../../lib/crm-analytics'
import CameraCapture from '../../../components/CameraCapture'
import styles from './simple-wizard.module.css'

export default function SimpleListingEntry({ pageSlug = '/create-listing-simple' }: { pageSlug?: string }) {
  const PAGE_SLUG = pageSlug
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, user, loading: authLoading, profileComplete, tosAccepted } = useAuth()
  const { requireAuth } = useQuickSetup()
  const supabase = createClient()

  // ── URL params from lead providers ──
  const paramEmail = searchParams.get('email') || ''
  const paramName = searchParams.get('name') || ''
  const paramPhone = searchParams.get('phone') || ''
  const paramZipcode = searchParams.get('zipcode') || ''
  const paramAddress = searchParams.get('address') || ''

  // ── State ──
  const [freeformText, setFreeformText] = useState('')
  const [photos, setPhotos] = useState<string[]>([])

  // General
  const [error, setError] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isSubmittedRef = useRef(false)
  const submitDurationRef = useRef<number | null>(null)

  const accumulatedTimeRef = useRef(0)
  const lastActiveTimeRef = useRef(Date.now())

  const freeformTextRef = useRef(freeformText)
  const photosRef = useRef(photos)

  useEffect(() => {
    freeformTextRef.current = freeformText
  }, [freeformText])

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  const getActiveDurationSecs = useCallback(() => {
    let totalMs = accumulatedTimeRef.current
    if (typeof document !== 'undefined' && !document.hidden) {
      totalMs += Date.now() - lastActiveTimeRef.current
    }
    // Convert to seconds, capped at 15 minutes (900 seconds) as a safety boundary
    return Math.min(Math.round(totalMs / 1000), 900)
  }, [])

  // ── Tracking: reset session and track step 1 on mount ──
  useEffect(() => {
    resetSessionId(PAGE_SLUG)
    trackEvent('wizard_step', PAGE_SLUG, { step_index: 1, step_name: 'text_input' })
    isSubmittedRef.current = false
    accumulatedTimeRef.current = 0
    lastActiveTimeRef.current = Date.now()

    // Restore prefill from sessionStorage if present (e.g. after social login redirect)
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('simple_listing_prefill')
      if (stored) {
        try {
          const data = JSON.parse(stored)
          if (data.originalText) {
            setFreeformText(data.originalText)
          }
          if (data.photos?.length) {
            setPhotos(data.photos)
          }
        } catch (e) {
          console.warn('Failed to parse simple_listing_prefill on mount:', e)
        }
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        accumulatedTimeRef.current += Date.now() - lastActiveTimeRef.current
      } else {
        lastActiveTimeRef.current = Date.now()
      }
    }

    // Track abandon on unload
    const handleUnload = () => {
      if (isSubmittedRef.current) return
      const secs = getActiveDurationSecs()
      trackEvent('wizard_abandon', PAGE_SLUG, {
        last_step: 1,
        last_step_name: 'text_input',
        time_on_step_secs: secs,
        has_text: !!freeformTextRef.current,
        photo_count: photosRef.current.length,
      })
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [getActiveDurationSecs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Placeholders ──
  const placeholderLoggedIn =
    "Describe what you'd like to sell. For example:\nI want to create a listing for 5 dozen oranges at $5 per dozen."

  const placeholderLoggedOut =
    "Describe what you'd like to sell. For example:\nI want to create a listing for 5 dozen oranges at $5 per dozen.\n\nI can deliver Saturday afternoon within 2 miles of my address, or buyers can pick up Sunday morning from my home in 95110."

  // ── Photo handling ──
  const handlePhotoFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setPhotos(prev => [...prev, dataUrl])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [])

  const removePhoto = useCallback((index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }, [])


  // ── Navigate to Add Product Listing with text + photos ──
  const navigateToForm = useCallback((overrideDuration?: number) => {
    isSubmittedRef.current = true
    console.log('[SimpleListingEntry] navigateToForm called. text:', freeformText, 'photos:', photos.length)
    // Store text + photos for AddProductListing to read and auto-fill
    const prefillData = {
      photos,
      originalText: freeformText,
      description: freeformText,
      fromSimpleWizard: true,
    }
    sessionStorage.setItem('simple_listing_prefill', JSON.stringify(prefillData))

    // Track step transition
    const secs = overrideDuration !== undefined 
      ? overrideDuration 
      : getActiveDurationSecs()

    trackStepTiming(PAGE_SLUG, 1, 'text_input', secs)
    trackEvent('wizard_step', PAGE_SLUG, { step_index: 2, step_name: 'add_product_form' })

    console.log('[SimpleListingEntry] pushing to /my-booth/products/new?from=simple-wizard')
    router.push('/my-booth/products/new?from=simple-wizard')
  }, [freeformText, photos, router, getActiveDurationSecs])

  // ── Auto-redirect after social login/OTP onboarding completion ──
  useEffect(() => {
    console.log('[SimpleListingEntry] Auth check:', { authLoading, isAuthenticated, profileComplete, tosAccepted })
    if (!authLoading && isAuthenticated && profileComplete && tosAccepted) {
      const stored = sessionStorage.getItem('simple_listing_prefill')
      console.log('[SimpleListingEntry] stored prefill in sessionStorage:', stored)
      if (stored) {
        try {
          const data = JSON.parse(stored)
          if (data.intent === 'submit') {
            navigateToForm(submitDurationRef.current ?? undefined)
          } else {
            // For 'login' intent or default, stay on the page, restore values, and clear prefill
            if (data.originalText) setFreeformText(data.originalText)
            if (data.photos?.length) setPhotos(data.photos)
            sessionStorage.removeItem('simple_listing_prefill')
          }
        } catch (e) {
          console.warn('Failed to parse prefill in redirect check:', e)
          navigateToForm() // fallback
        }
      }
    }
  }, [authLoading, isAuthenticated, profileComplete, tosAccepted, navigateToForm])

  // ── Submit handler ──
  const handleSubmit = () => {
    setError('')

    if (!freeformText.trim() && photos.length === 0) {
      setError('Please describe what you want to sell or add some photos.')
      return
    }

    const currentDuration = getActiveDurationSecs()
    submitDurationRef.current = currentDuration

    if (!isAuthenticated) {
      // Save text + photos to sessionStorage immediately so they are preserved across redirect
      const prefillData = {
        photos,
        originalText: freeformText,
        description: freeformText,
        fromSimpleWizard: true,
        intent: 'submit',
      }
      sessionStorage.setItem('simple_listing_prefill', JSON.stringify(prefillData))

      // Open QuickSetupModal — on complete, navigate
      requireAuth({
        trigger: 'simple_listing_create',
        addressNote: 'Your address is stored securely and never shared publicly. We use it to assign your listing to your local community market, calculate delivery ranges for buyers, and determine sales tax.',
        prefill: {
          email: paramEmail || undefined,
          name: paramName || undefined,
          phone: paramPhone || undefined,
          zip: paramZipcode || undefined,
          street: paramAddress || undefined,
        },
        onReady: () => {
          navigateToForm(submitDurationRef.current ?? undefined)
        },
      })
      return
    }

    navigateToForm(currentDuration)
  }

  // ── Loading state ──
  if (authLoading) {
    return (
      <div className={styles.container} style={{ textAlign: 'center', padding: 80 }}>
        <p style={{ color: '#6b7280' }}>Loading...</p>
      </div>
    )
  }

  // ── Input phase ──
  return (
    <div>
      {/* Hero Header */}
      <div className={styles.hero}>
        <div className={styles.header}>
          <h1 className={styles.title}>Start <span className={styles.titleHighlight}>Earning</span> From Your Garden</h1>
          <p className={styles.subtitle}>
            Tell us what you're growing — we'll handle the rest. It's free.
          </p>
          <div className={styles.trustChips}>
            <span className={styles.trustChip}>⏱ 2 minutes</span>
            <span className={styles.trustChip}>🔒 Free to list</span>
          </div>
        </div>
      </div>

      <div className={`${styles.container} ${styles.formCard}`}>
        {/* Error banner */}
        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* Textarea */}
        <div className={styles.textareaSection}>
          <label className={styles.textareaLabel}>What are you selling?</label>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder={isAuthenticated ? placeholderLoggedIn : placeholderLoggedOut}
            value={freeformText}
            onChange={e => {
              setFreeformText(e.target.value)
              // Auto-grow
              const el = textareaRef.current
              if (el) {
                el.style.height = 'auto'
                el.style.height = `${Math.max(140, el.scrollHeight)}px`
              }
            }}
            onBlur={() => trackFieldInteract(PAGE_SLUG, 1, 'freeform_text', !!freeformText.trim())}
          />
          {freeformText.length > 0 && (
            <div className={`${styles.charHint} ${freeformText.length > 20 ? styles.charHintActive : ''}`}>
              {freeformText.length < 20 ? 'Keep going — the more detail, the better your listing!' : '✓ Great description'}
            </div>
          )}
        </div>

        {/* Photos */}
        <div className={styles.photosSection}>
          <label className={styles.photosLabel}>
            📸 Add photos
          </label>
          
          {photos.length === 0 ? (
            <div
              className={`${styles.photoUploadZone} ${dragActive ? styles.dragActive : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={e => {
                e.preventDefault()
                setDragActive(false)
                const file = e.dataTransfer.files?.[0]
                if (file && file.type.startsWith('image/')) {
                  const reader = new FileReader()
                  reader.onload = (ev) => {
                    const dataUrl = ev.target?.result as string
                    setPhotos(prev => [...prev, dataUrl])
                  }
                  reader.readAsDataURL(file)
                }
              }}
            >
              <span className={styles.photoUploadIcon}>{dragActive ? '📥' : '📷'}</span>
              <span className={styles.photoUploadText}>{dragActive ? 'Drop your photo here' : 'Add your first photo'}</span>
              <span className={styles.photoUploadHint}>Listings with photos sell 3× faster. You can add them later too.</span>
              <div className={styles.buttonPair} style={{ marginTop: 12, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                <button
                  className={styles.photoBtn}
                  onClick={e => { e.stopPropagation(); setShowCamera(true) }}
                >
                  📷 Take Photo
                </button>
                <button
                  className={styles.photoBtn}
                  onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                >
                  📁 Upload
                </button>
                <button
                  type="button"
                  className={styles.doItLaterLink}
                  onClick={e => {
                    e.stopPropagation()
                    handleSubmit()
                  }}
                >
                  I&apos;ll do it later
                </button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px' }}>
                Listings with photos sell 3× faster. You can add them later too.
              </p>
              <div className={styles.photosGrid}>
                {photos.map((photo, i) => (
                  <div key={i} className={styles.photoThumb}>
                    <img src={photo} alt={`Product photo ${i + 1}`} />
                    <button
                      className={styles.photoRemove}
                      onClick={() => removePhoto(i)}
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className={styles.buttonPair}>
                  <button
                    className={styles.photoBtn}
                    onClick={() => setShowCamera(true)}
                  >
                    📷 Take Photo
                  </button>
                  <button
                    className={styles.photoBtn}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📁 Upload
                  </button>
                </div>
              </div>
            </>
          )}
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoFile}
            hidden
          />
        </div>

        {/* Camera Widget */}
        {showCamera && (
          <CameraCapture
            facingMode="environment"
            closeLabel="✕ Cancel"
            onClose={() => setShowCamera(false)}
            onCapture={({ file }) => {
              setShowCamera(false)
              const reader = new FileReader()
              reader.onload = (ev) => {
                const dataUrl = ev.target?.result as string
                setPhotos(prev => [...prev, dataUrl])
              }
              reader.readAsDataURL(file)
            }}
          />
        )}

        {/* Submit */}
        <div className={styles.submitSection}>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={!freeformText.trim() && photos.length === 0}
          >
            Create My Listing
          </button>
          <button
            className={styles.skipLink}
            onClick={() => {
              trackEvent('button_click', PAGE_SLUG, { button: 'skip_to_full_form' })
              if (typeof window !== 'undefined') {
                sessionStorage.removeItem('simple_listing_prefill')
              }
              router.push(isAuthenticated ? '/my-booth/products/new' : '/create-listing')
            }}
          >
            or use step-by-step form →
          </button>
        </div>
      </div>
    </div>
  )
}
