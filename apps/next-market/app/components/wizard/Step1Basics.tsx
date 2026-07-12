'use client'
import React, { useState, useRef, useEffect } from 'react'
import { useWizard } from './WizardContext'
import styles from './wizard.module.css'
import { createClient } from '../../../lib/supabase'
import CameraCapture from '../../../components/CameraCapture'
import { trackFieldInteract, trackAiUsage, trackEvent } from '../../../lib/crm-analytics'

export default function Step1Basics() {
  const { state, updateState, nextStep, isAuthenticated, isAuthLoading } = useWizard()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [showInlineOtp, setShowInlineOtp] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [categories, setCategories] = useState<{name: string}[]>([])
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiToast, setAiToast] = useState<string | null>(null)
  const [allBooths, setAllBooths] = useState<{id: string, name: string}[]>([])
  
  // Recipe Generation States
  const [isGeneratingRecipes, setIsGeneratingRecipes] = useState(false)
  const [generatedRecipesList, setGeneratedRecipesList] = useState<string[]>([])

  // AI Progress States
  const [aiProgressStep, setAiProgressStep] = useState(0)
  const aiProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [recipeProgressStep, setRecipeProgressStep] = useState(0)
  const recipeProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [recipeIntro, setRecipeIntro] = useState('')

  const otpCodeRef = useRef(otpCode)
  const showInlineOtpRef = useRef(showInlineOtp)
  const wentNext = useRef(false)
  const stateRef = useRef(state)

  useEffect(() => {
    otpCodeRef.current = otpCode
    showInlineOtpRef.current = showInlineOtp
    stateRef.current = state
  }, [otpCode, showInlineOtp, state])

  useEffect(() => {
    trackFieldInteract('/create-listing', 1, 'next_button', false)
    const startTime = Date.now()

    const handleUnload = () => {
      if (!wentNext.current) {
        const duration = (Date.now() - startTime) / 1000
        const st = stateRef.current
        trackEvent('wizard_abandon', '/create-listing', {
          last_step: 1,
          last_step_name: 'basics',
          time_on_step_secs: Math.round(duration)
        })
        trackFieldInteract('/create-listing', 1, 'product_name', !!st.name.trim())
        trackFieldInteract('/create-listing', 1, 'category', !!st.category)
        trackFieldInteract('/create-listing', 1, 'description', !!st.description.trim())
        trackFieldInteract('/create-listing', 1, 'harvest_date', !!st.harvestedAt)
        trackFieldInteract('/create-listing', 1, 'email', !!st.email.trim())
        if (showInlineOtpRef.current) {
          trackFieldInteract('/create-listing', 1, 'otp_code', !!otpCodeRef.current.trim())
        }
      }
    }

    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      if (!wentNext.current) {
        const duration = (Date.now() - startTime) / 1000
        if (duration < 0.5) return

        const st = stateRef.current
        trackEvent('wizard_abandon', '/create-listing', {
          last_step: 1,
          last_step_name: 'basics',
          time_on_step_secs: Math.round(duration)
        })
        trackFieldInteract('/create-listing', 1, 'product_name', !!st.name.trim())
        trackFieldInteract('/create-listing', 1, 'category', !!st.category)
        trackFieldInteract('/create-listing', 1, 'description', !!st.description.trim())
        trackFieldInteract('/create-listing', 1, 'harvest_date', !!st.harvestedAt)
        trackFieldInteract('/create-listing', 1, 'email', !!st.email.trim())
        if (showInlineOtpRef.current) {
          trackFieldInteract('/create-listing', 1, 'otp_code', !!otpCodeRef.current.trim())
        }
      }
    }
  }, [])

  useEffect(() => {
    if (showInlineOtp) {
      trackFieldInteract('/create-listing', 1, 'verify_otp_button', false)
    }
  }, [showInlineOtp])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const handleAiAutoFill = async () => {
    if (state.photos.length === 0) return
    trackAiUsage('/create-listing', 'clicked', 'photo_autofill')
    setAiAnalyzing(true)
    setAiToast(null)

    setAiProgressStep(1)
    aiProgressTimerRef.current = setInterval(() => {
      setAiProgressStep(prev => Math.min(prev + 1, 4))
    }, 2500)

    const tryInvoke = async (): Promise<{ data: any; error: any }> => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)
      try {
        const res = await supabase.functions.invoke('analyze-product-photo', {
          body: { image: state.photos[0] },
        })
        clearTimeout(timeout)
        return res
      } catch (err: any) {
        clearTimeout(timeout)
        if (err?.name === 'AbortError') {
          return { data: null, error: { message: 'Request timed out (45s)' } }
        }
        throw err
      }
    }

    try {
      let res = await tryInvoke()

      // Auto-retry once on invocation error (cold start, transient 503, etc.)
      if (res.error) {
        console.warn('AI autofill first attempt failed, retrying:', res.error?.message || res.error)
        await new Promise(r => setTimeout(r, 1500))
        res = await tryInvoke()
      }

      if (res.error) {
        const errMsg = res.error?.message || res.error?.name || 'Unknown error'
        setAiToast(`⚠️ AI analysis unavailable (${errMsg}) — please fill in manually.`)
        trackAiUsage('/create-listing', 'dismissed', 'photo_autofill')
        if (aiProgressTimerRef.current) clearInterval(aiProgressTimerRef.current)
        setAiProgressStep(0)
        setAiAnalyzing(false)
        setTimeout(() => setAiToast(null), 15000)
        return
      }

      const data = res.data as any

      if (data?.error) {
        const errorDetail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
        setAiToast(`⚠️ ${data.error === 'AI not configured' ? 'AI service not configured' : `AI analysis failed: ${errorDetail.slice(0, 120)}`} — please fill in manually.`)
        trackAiUsage('/create-listing', 'dismissed', 'photo_autofill')
        if (aiProgressTimerRef.current) clearInterval(aiProgressTimerRef.current)
        setAiProgressStep(0)
        setAiAnalyzing(false)
        setTimeout(() => setAiToast(null), 15000)
        return
      }

      if (!data?.name && !data?.description && !data?.category) {
        setAiToast('⚠️ AI could not identify the product — please fill in manually.')
        trackAiUsage('/create-listing', 'dismissed', 'photo_autofill')
        if (aiProgressTimerRef.current) clearInterval(aiProgressTimerRef.current)
        setAiProgressStep(0)
        setAiAnalyzing(false)
        setTimeout(() => setAiToast(null), 15000)
        return
      }

      updateState({
        name: data.name || state.name,
        category: data.category && categories.some(c => c.name === data.category) ? data.category : state.category,
        description: data.description || state.description,
        unit: data.suggested_unit || state.unit,
      })
      trackAiUsage('/create-listing', 'applied', 'photo_autofill')
      trackFieldInteract('/create-listing', 1, 'product_name', !!(data.name || state.name))
      trackFieldInteract('/create-listing', 1, 'category', !!(data.category && categories.some(c => c.name === data.category) ? data.category : state.category))
      trackFieldInteract('/create-listing', 1, 'description', !!(data.description || state.description))
      setAiToast('✨ AI filled in product details — review and adjust!')
    } catch (err: any) {
      trackAiUsage('/create-listing', 'dismissed', 'photo_autofill')
      setAiToast(`⚠️ AI analysis failed — please fill in manually.`)
    }
    if (aiProgressTimerRef.current) clearInterval(aiProgressTimerRef.current)
    setAiProgressStep(0)
    setAiAnalyzing(false)
    setTimeout(() => setAiToast(null), 15000)
  }

  useEffect(() => {
    const loadCategories = async () => {
      const { data } = await supabase
        .from('sales_categories')
        .select('name')
        .order('display_order')
      if (data) {
        setCategories(data)
      }
    }
    loadCategories()

    // Fetch user booths for multi-booth selector
    if (isAuthenticated) {
      supabase.auth.getUser().then(({ data: { user } }: { data: { user: any } }) => {
        if (!user) return
        supabase.from('market_booths').select('id, name').eq('owner_id', user.id).order('created_at')
          .then(({ data: booths }: { data: any }) => {
            if (booths && booths.length > 0) {
              setAllBooths(booths.map((b: any) => ({ id: b.id, name: b.name || 'Unnamed Stand' })))
              // Pre-select first booth if none selected
              if (!state.boothId) {
                updateState({ boothId: booths[0].id })
              }
            }
          })
      })
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateRecipes = async () => {
    if (!state.name || isGeneratingRecipes) return
    trackAiUsage('/create-listing', 'clicked', 'recipe_suggestion')
    setIsGeneratingRecipes(true)
    setGeneratedRecipesList([])

    setRecipeProgressStep(1)
    recipeProgressTimerRef.current = setInterval(() => {
      setRecipeProgressStep(prev => Math.min(prev + 1, 3))
    }, 2500)
    
    try {
      const { data, error } = await supabase.functions.invoke('casabot-recipe-suggestions', {
        body: { 
          name: state.name,
          description: state.description,
          category: state.category
        }
      })
      
      if (data?.recipes && Array.isArray(data.recipes)) {
        setGeneratedRecipesList(data.recipes)
        if (data.intro) setRecipeIntro(data.intro)
      } else if (data?.recipes_markdown) {
        let rawMarkdown = data.recipes_markdown
        const splitRegex = /(?=### \d+\. )/
        const parsed = rawMarkdown.split(splitRegex)
        const filtered = parsed.filter((r: string) => r.trim().startsWith('###'))
        setGeneratedRecipesList(filtered.length > 0 ? filtered : [rawMarkdown])
        if (data.intro) setRecipeIntro(data.intro)
      }
    } catch (e) {
      console.error('Failed to generate recipes', e)
    } finally {
      if (recipeProgressTimerRef.current) clearInterval(recipeProgressTimerRef.current)
      setRecipeProgressStep(0)
      setIsGeneratingRecipes(false)
    }
  }

  const validateAndNext = async () => {
    trackEvent('button_click', '/create-listing', { step: 1, button: showInlineOtp ? 'verify_otp' : 'next' })
    trackFieldInteract('/create-listing', 1, 'product_name', !!state.name.trim())
    trackFieldInteract('/create-listing', 1, 'category', !!state.category)
    trackFieldInteract('/create-listing', 1, 'description', !!state.description.trim())
    trackFieldInteract('/create-listing', 1, 'harvest_date', !!state.harvestedAt)
    trackFieldInteract('/create-listing', 1, 'email', !!state.email.trim())
    if (showInlineOtp) {
      trackFieldInteract('/create-listing', 1, 'otp_code', !!otpCode.trim())
    }

    const newErrors: Record<string, string> = {}
    if (!state.name.trim()) newErrors.name = 'Name is required'
    if (!state.category) newErrors.category = 'Category is required'
    if (!(isAuthenticated || state.isExistingUser || isAuthLoading)) {
      if (!state.email.trim() || !/\S+@\S+\.\S+/.test(state.email)) {
        newErrors.email = 'Valid email is required'
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      trackEvent('wizard_validation_error', '/create-listing', {
        step: 1,
        fields: Object.keys(newErrors)
      })
      setTimeout(() => {
        const firstError = document.querySelector(`.${styles.errorText}`)
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return
    }

    if (isAuthenticated) {
      trackFieldInteract('/create-listing', 1, 'next_button', true)
      wentNext.current = true
      nextStep()
      return
    }

    if (!showInlineOtp) {
      setIsCheckingEmail(true)
      const { error } = await supabase.auth.signInWithOtp({ 
        email: state.email.toLowerCase(),
        options: { shouldCreateUser: false }
      })
      setIsCheckingEmail(false)

      if (!error) {
        updateState({ isExistingUser: true })
        trackFieldInteract('/create-listing', 1, 'next_button', true)
        setShowInlineOtp(true)
        return
      } else {
        updateState({ isExistingUser: false })
        trackFieldInteract('/create-listing', 1, 'next_button', true)
        wentNext.current = true
        nextStep()
      }
    } else {
      setIsCheckingEmail(true)
      const { data, error } = await supabase.auth.verifyOtp({ email: state.email.toLowerCase(), token: otpCode, type: 'email' })

      if (error) {
        setIsCheckingEmail(false)
        setOtpError(error.message)
      } else {
        let profileUpdates: Partial<typeof state> = {}
        let isCompleted = false
        if (data?.user?.id) {
          const [{ data: profile }, { data: booth }] = await Promise.all([
            supabase.from('profiles').select('full_name, street_address, city, state_code, zip_code, profile_completed_at, tos_accepted_at').eq('id', data.user.id).single(),
            supabase.from('market_booths').select('offers_delivery, offers_pickup, delivery_radius_miles, pickup_address, delivery_windows, pickup_windows').eq('owner_id', data.user.id).single()
          ])

          if (profile) {
            profileUpdates.fullName = profile.full_name || ''
            profileUpdates.address = profile.street_address || ''
            profileUpdates.city = profile.city || ''
            profileUpdates.state_code = profile.state_code || ''
            isCompleted = !!(profile.profile_completed_at && profile.tos_accepted_at)
          }
          if (booth) {
            profileUpdates.offersDelivery = booth.offers_delivery ?? true
            profileUpdates.offersPickup = booth.offers_pickup ?? true
            profileUpdates.deliveryRadius = booth.delivery_radius_miles || 5
            profileUpdates.pickupAddress = booth.pickup_address || ''
            if (booth.delivery_windows) profileUpdates.deliveryWindows = booth.delivery_windows
            if (booth.pickup_windows) profileUpdates.pickupWindows = booth.pickup_windows
          } else if (profile?.street_address) {
            profileUpdates.pickupAddress = [profile.street_address, profile.city, `${profile.state_code || ''} ${profile.zip_code || ''}`.trim()].filter(Boolean).join(', ')
          }
        }

        setIsCheckingEmail(false)
        updateState({ ...profileUpdates, isExistingUser: isCompleted })
        trackFieldInteract('/create-listing', 1, 'verify_otp_button', true)
        wentNext.current = true
        nextStep()
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      updateState(prev => ({ photos: [...(prev.photos || []), dataUrl] }))
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCapture = (result: any) => {
    const file = result.file
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      updateState(prev => ({ photos: [...(prev.photos || []), dataUrl] }))
    }
    reader.readAsDataURL(file)
    setShowCamera(false)
  }

  const removePhoto = (index: number) => {
    updateState(prev => {
      const newPhotos = [...(prev.photos || [])]
      newPhotos.splice(index, 1)
      return { photos: newPhotos }
    })
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Create Your Product Listing</h2>

      {/* Stand Selector (multi-stand users) */}
      {allBooths.length > 1 && (
        <div className={styles.formGroup}>
          <label className={styles.label}>🏪 Stand</label>
          <select
            className={styles.input}
            value={state.boothId || ''}
            onChange={(e) => updateState({ boothId: e.target.value })}
          >
            {allBooths.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            This product will be listed at the selected stand
          </div>
        </div>
      )}
      
      <div className={styles.formGroup}>
        <label className={styles.label}>Photos</label>
        {state.photos.length > 0 ? (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
            {state.photos.map((photo, i) => (
              <div key={i} style={{ width: 80, height: 80, flexShrink: 0, borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button 
                  onClick={() => removePhoto(i)}
                  style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            ))}

            {state.photos.length < 5 && (
              <>
                <button 
                  onClick={() => setShowCamera(true)}
                  style={{ width: 80, height: 80, flexShrink: 0, border: '2px dashed #d1d5db', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f3f4f6', gap: 4 }}
                >
                  <span style={{ fontSize: 20 }}>📸</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#4b5563' }}>Camera</span>
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: 80, height: 80, flexShrink: 0, border: '2px dashed #d1d5db', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f3f4f6', gap: 4 }}
                >
                  <span style={{ fontSize: 20 }}>📁</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#4b5563' }}>Upload</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              type="button" 
              onClick={() => setShowCamera(true)}
              style={{ flex: 1, padding: '16px 8px', borderRadius: 12, border: '2px dashed #d1d5db', background: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 24 }}>📸</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#4b5563' }}>Take Photo to List</span>
            </button>
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              style={{ flex: 1, padding: '16px 8px', borderRadius: 12, border: '2px dashed #d1d5db', background: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 24 }}>🖼️</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#4b5563' }}>Upload</span>
            </button>
          </div>
        )}
      </div>

      {state.photos.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          {aiToast && (
            <div style={{ marginBottom: 8, fontSize: 13, color: aiToast.includes('⚠️') ? '#b91c1c' : '#15803d', fontWeight: 600, textAlign: 'center' }}>
              {aiToast}
            </div>
          )}
          <button
            type="button"
            onClick={handleAiAutoFill}
            disabled={aiAnalyzing}
            style={{
              width: '100%', padding: '12px 20px',
              borderRadius: 12,
              border: aiAnalyzing ? '2px solid #a78bfa' : '2px solid #86efac',
              background: aiAnalyzing
                ? 'linear-gradient(135deg, #ede9fe, #ddd6fe)'
                : 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
              color: aiAnalyzing ? '#5b21b6' : '#166534',
              fontSize: 15, fontWeight: 600,
              cursor: aiAnalyzing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            {aiAnalyzing ? (
              <>
                <span className={styles.spinIcon}>⏳</span>
                <span>AI is analyzing your photo...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>Auto-fill details from photo</span>
              </>
            )}
          </button>
          {aiAnalyzing && aiProgressStep > 0 && (
            <div className={styles.aiProgressList}>
              {[{ step: 1, text: '📤 Sending photo to AI...' }, { step: 2, text: '🔍 AI is examining your produce...' }, { step: 3, text: '📝 Writing product details...' }, { step: 4, text: '✨ Almost ready...' }].map(({ step, text }) => (
                <div key={step} className={`${styles.aiProgressStep} ${aiProgressStep > step ? styles.aiProgressDone : aiProgressStep === step ? styles.aiProgressActive : styles.aiProgressPending}`}>
                  <span className={styles.aiProgressIcon}>{aiProgressStep > step ? '✅' : aiProgressStep === step ? '⏳' : '○'}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      <div className={styles.formGroup}>
        <label className={styles.label}>Product Name</label>
        <input 
          className={styles.input} 
          value={state.name} 
          onChange={(e) => updateState({ name: e.target.value })}
          onBlur={() => trackFieldInteract('/create-listing', 1, 'product_name', !!state.name.trim())}
          placeholder="e.g. Organic Heirloom Tomatoes" 
        />
        {errors.name && <div className={styles.errorText}>{errors.name}</div>}
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Category</label>
        <select 
          className={styles.input}
          value={state.category}
          onChange={(e) => {
            updateState({ category: e.target.value })
            trackFieldInteract('/create-listing', 1, 'category', !!e.target.value)
          }}
        >
          <option value="">Select Category</option>
          {categories.map(c => (
            <option key={c.name} value={c.name}>{c.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
          ))}
        </select>
        {errors.category && <div className={styles.errorText}>{errors.category}</div>}
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label} style={{ marginBottom: 6, display: 'block' }}>Description</label>
        <textarea 
          className={styles.input}
          rows={4}
          value={state.description}
          onChange={(e) => updateState({ description: e.target.value })}
          onBlur={() => trackFieldInteract('/create-listing', 1, 'description', !!state.description.trim())}
          placeholder="Tell buyers about your produce..."
        />
        {/* CasaBot Recipe Assistant */}
        <div style={{ marginTop: 8 }}>
          <button 
            type="button"
            onClick={(e) => { 
              e.preventDefault(); 
              if (state.name.trim().length > 2) handleGenerateRecipes(); 
            }}
            disabled={isGeneratingRecipes || (state.name || '').trim().length <= 2}
            style={{ 
              background: 'linear-gradient(135deg, #f0fdf4, #fffbeb)', 
              border: '1px solid #86efac', 
              borderRadius: 8, 
              padding: '4px 12px', 
              fontSize: 13, 
              color: ((state.name || '').trim().length > 2) ? '#166534' : '#9ca3af', 
              cursor: isGeneratingRecipes ? 'wait' : ((state.name || '').trim().length > 2 ? 'pointer' : 'not-allowed'), 
              fontWeight: 600, 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 6,
              opacity: ((state.name || '').trim().length > 2) ? 1 : 0.6
            }}
            title={((state.name || '').trim().length <= 2) ? "Enter a product name first" : "Generate recipes"}
          >
            <img src="/growbot-avatar-v3.png" alt="GrowBot" style={{ width: 14, height: 14, borderRadius: '50%' }} /> {isGeneratingRecipes ? 'Thinking...' : 'Ask GrowBot for Recipes ✨'}
          </button>
          {isGeneratingRecipes && recipeProgressStep > 0 && (
            <div className={styles.aiProgressList}>
              {[{ step: 1, text: '🧑‍🍳 Reading your product details...' }, { step: 2, text: '📖 Finding matching recipes...' }, { step: 3, text: '✨ Writing up suggestions...' }].map(({ step, text }) => (
                <div key={step} className={`${styles.aiProgressStep} ${recipeProgressStep > step ? styles.aiProgressDone : recipeProgressStep === step ? styles.aiProgressActive : styles.aiProgressPending}`}>
                  <span className={styles.aiProgressIcon}>{recipeProgressStep > step ? '✅' : recipeProgressStep === step ? '⏳' : '○'}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {generatedRecipesList.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {generatedRecipesList.map((recipeMarkdown, i) => (
              <div 
                key={i}
                onClick={() => {
                  const recipeText = recipeMarkdown.replace(/^[🍳🥘🍞🍯🫖🥗💐🏡📸🫙]+\s*/, '')
                  const introLine = recipeIntro || 'Not sure what to make? Try this:'
                  const newDesc = state.description.trim() + `\n\n✨ ${introLine}\n` + recipeText
                  updateState({ description: newDesc.trim() })
                  trackAiUsage('/create-listing', 'applied', 'recipe_suggestion')
                  trackFieldInteract('/create-listing', 1, 'description', true)
                  setGeneratedRecipesList([]) // close after selecting
                }}
                style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: 12, borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s', fontSize: 13, color: '#334155' }}
                title="Click to insert recipe into description"
              >
                <div style={{ pointerEvents: 'none' }}>
                   {recipeMarkdown.replace(/\*\*/g, '')}
                </div>
                <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, marginTop: 4 }}>+ Click to add recipe to description</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>🌾 Harvest Date <span className={styles.optional}>(optional)</span></label>
        <input 
          type="date"
          className={styles.input} 
          value={state.harvestedAt || ''} 
          onChange={(e) => updateState({ harvestedAt: e.target.value })}
          onBlur={() => trackFieldInteract('/create-listing', 1, 'harvest_date', !!state.harvestedAt)}
          max={new Date().toISOString().split('T')[0]} 
        />
        {state.harvestedAt && (
          <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4, fontWeight: 600 }}>
            {(() => {
              const days = Math.round((Date.now() - new Date(state.harvestedAt + 'T12:00:00').getTime()) / 86400000)
              if (days <= 0) return '🟢 Harvested today — ultra fresh!'
              if (days === 1) return '🟢 Harvested yesterday — very fresh!'
              if (days <= 3) return `🟢 Harvested ${days} days ago — fresh!`
              return `🟡 Harvested ${days} days ago`
            })()}
          </div>
        )}
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Contact Email</label>
        <span className={styles.labelDesc}>We'll save your progress here.</span>
        <input 
          type="email"
          className={styles.input}
          style={{ borderColor: '#16a34a', boxShadow: '0 0 0 3px #dcfce7', background: isAuthenticated ? '#f3f4f6' : 'white' }}
          value={state.email}
          onChange={(e) => updateState({ email: e.target.value })}
          onBlur={() => trackFieldInteract('/create-listing', 1, 'email', !!state.email.trim())}
          placeholder="yourname@email.com"
          disabled={showInlineOtp || isAuthenticated}
        />
        {errors.email && <div className={styles.errorText}>{errors.email}</div>}
      </div>

      {!isAuthenticated && showInlineOtp && (
        <div style={{ background: '#f0fdf4', padding: 20, borderRadius: 24, marginBottom: 24, border: '1px solid #bbf7d0' }}>
          <h4 style={{ marginBottom: 12, color: '#15803d', fontWeight: 600 }}>Welcome Back!</h4>
          <p style={{ fontSize: 13, marginBottom: 16, color: '#166534' }}>We sent a 6-digit code to {state.email}.</p>
          <input 
            type="text" 
            placeholder="1 2 3 4 5 6" 
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            onBlur={() => trackFieldInteract('/create-listing', 1, 'otp_code', !!otpCode.trim())}
            style={{ width: '100%', textAlign: 'center', letterSpacing: 8, fontSize: 20, fontWeight: 700, padding: 12, borderRadius: 12, border: '1px solid #16a34a' }} 
          />
          {otpError && <div className={styles.errorText} style={{ textAlign: 'center' }}>{otpError}</div>}
        </div>
      )}

      <hr style={{ border: 0, borderTop: '1px dashed #d1d5db', margin: '32px 0' }} />

      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInner}>
          <button className={styles.btnPrimary} onClick={validateAndNext} disabled={isCheckingEmail || isAuthLoading}>
            {isAuthLoading ? 'Loading...' : (isCheckingEmail ? 'Checking...' : (showInlineOtp ? 'Verify & Continue' : 'Next →'))}
          </button>
        </div>
      </div>

      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange} 
      />

      {showCamera && (
        <CameraCapture 
          onCapture={handleCapture} 
          onClose={() => setShowCamera(false)}
          cropSquare
        />
      )}
    </div>
  )
}
