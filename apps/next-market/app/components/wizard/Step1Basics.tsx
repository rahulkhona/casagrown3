'use client'
import React, { useState, useRef, useEffect } from 'react'
import { useWizard } from './WizardContext'
import styles from './wizard.module.css'
import { createClient } from '../../../lib/supabase'
import CameraCapture from '../../../components/CameraCapture'

export default function Step1Basics() {
  const { state, updateState, nextStep, isAuthenticated } = useWizard()
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
  const [recipeIntro, setRecipeIntro] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const handleAiAutoFill = async () => {
    if (state.photos.length === 0) return
    setAiAnalyzing(true)
    setAiToast(null)

    try {
      const res = await supabase.functions.invoke('analyze-product-photo', {
        body: { image: state.photos[0] },
      })
      
      if (res.error) {
        setAiToast(`⚠️ AI analysis failed — please fill in manually.`)
        setAiAnalyzing(false)
        setTimeout(() => setAiToast(null), 5000)
        return
      }

      const data = res.data as any
      if (!data?.name && !data?.description && !data?.category) {
        setAiToast('⚠️ AI could not identify the product — please fill in manually.')
        setAiAnalyzing(false)
        setTimeout(() => setAiToast(null), 5000)
        return
      }

      updateState({
        name: data.name || state.name,
        category: data.category && categories.some(c => c.name === data.category) ? data.category : state.category,
        description: data.description || state.description,
      })
      setAiToast('✨ AI filled in product details — review and adjust!')
    } catch (err: any) {
      setAiToast(`⚠️ AI analysis failed — please fill in manually.`)
    }
    setAiAnalyzing(false)
    setTimeout(() => setAiToast(null), 6000)
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
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return
        supabase.from('market_booths').select('id, name').eq('owner_id', user.id).order('created_at')
          .then(({ data: booths }) => {
            if (booths && booths.length > 0) {
              setAllBooths(booths.map((b: any) => ({ id: b.id, name: b.name || 'Unnamed Booth' })))
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
    setIsGeneratingRecipes(true)
    setGeneratedRecipesList([])
    
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
      setIsGeneratingRecipes(false)
    }
  }

  const validateAndNext = async () => {
    const newErrors: Record<string, string> = {}
    if (!state.name.trim()) newErrors.name = 'Name is required'
    if (!state.category) newErrors.category = 'Category is required'
    if (!(isAuthenticated || state.isExistingUser)) {
      if (!state.email.trim() || !/\S+@\S+\.\S+/.test(state.email)) {
        newErrors.email = 'Valid email is required'
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (isAuthenticated) {
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
        setShowInlineOtp(true)
        return
      } else {
        updateState({ isExistingUser: false })
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
        if (data?.user?.id) {
          const [{ data: profile }, { data: booth }] = await Promise.all([
            supabase.from('profiles').select('full_name, street_address, city, state_code').eq('id', data.user.id).single(),
            supabase.from('booth_settings').select('offers_delivery, offers_pickup, delivery_radius_miles, pickup_address, delivery_windows, pickup_windows').eq('owner_id', data.user.id).single()
          ])

          if (profile) {
            profileUpdates.fullName = profile.full_name || ''
            profileUpdates.address = profile.street_address || ''
            profileUpdates.city = profile.city || ''
            profileUpdates.state_code = profile.state_code || ''
          }
          if (booth) {
            profileUpdates.offersDelivery = booth.offers_delivery ?? true
            profileUpdates.offersPickup = booth.offers_pickup ?? true
            profileUpdates.deliveryRadius = booth.delivery_radius_miles || 5
            profileUpdates.pickupAddress = booth.pickup_address || ''
            if (booth.delivery_windows) profileUpdates.deliveryWindows = booth.delivery_windows
            if (booth.pickup_windows) profileUpdates.pickupWindows = booth.pickup_windows
          } else if (profile?.street_address) {
            profileUpdates.pickupAddress = [profile.street_address, profile.city, profile.state_code].filter(Boolean).join(', ')
          }
        }
        
        setIsCheckingEmail(false)
        updateState({ ...profileUpdates, isExistingUser: true })
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

      {/* Booth Selector (multi-booth users) */}
      {allBooths.length > 1 && (
        <div className={styles.formGroup}>
          <label className={styles.label}>🏪 Booth</label>
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
            This product will be listed at the selected booth
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
        </div>
      )}


      <div className={styles.formGroup}>
        <label className={styles.label}>Product Name</label>
        <input 
          className={styles.input} 
          value={state.name} 
          onChange={(e) => updateState({ name: e.target.value })}
          placeholder="e.g. Organic Heirloom Tomatoes" 
        />
        {errors.name && <div className={styles.errorText}>{errors.name}</div>}
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Category</label>
        <select 
          className={styles.input}
          value={state.category}
          onChange={(e) => updateState({ category: e.target.value })}
        >
          <option value="">Select Category</option>
          {categories.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
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
            style={{ width: '100%', textAlign: 'center', letterSpacing: 8, fontSize: 20, fontWeight: 700, padding: 12, borderRadius: 12, border: '1px solid #16a34a' }} 
          />
          {otpError && <div className={styles.errorText} style={{ textAlign: 'center' }}>{otpError}</div>}
        </div>
      )}

      <hr style={{ border: 0, borderTop: '1px dashed #d1d5db', margin: '32px 0' }} />

      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInner}>
          <button className={styles.btnPrimary} onClick={validateAndNext} disabled={isCheckingEmail}>
            {isCheckingEmail ? 'Checking...' : (showInlineOtp ? 'Verify & Continue' : 'Next →')}
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
