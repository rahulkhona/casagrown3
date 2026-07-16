'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useWizard } from './WizardContext'
import styles from './wizard.module.css'
import { createClient } from '../../../lib/supabase'
import { trackFieldInteract as rawTrackFieldInteract, trackAiUsage as rawTrackAiUsage, trackEvent as rawTrackEvent } from '../../../lib/crm-analytics'

export default function Step3Pricing() {
  const { state, updateState, nextStep, prevStep, isAuthenticated, pageSlug } = useWizard()
  const trackEvent = (type: any, _: string, data?: any) => rawTrackEvent(type, pageSlug, data)
  const trackFieldInteract = (_: string, step: number, field: string, value: boolean) => rawTrackFieldInteract(pageSlug, step, field, value)
  const trackAiUsage = (_: string, action: any, button: string) => rawTrackAiUsage(pageSlug, action, button)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [suggestedPrice, setSuggestedPrice] = useState<{ price_usd: number; unit: string; source: string } | null>(null)
  const [suggestingPrice, setSuggestingPrice] = useState(false)
  const supabase = createClient()
  
  const wentNext = useRef(false)
  const wentBack = useRef(false)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    trackFieldInteract('/create-listing', 3, 'next_button', false)
    const startTime = Date.now()

    const handleUnload = () => {
      if (!wentNext.current && !wentBack.current) {
        const duration = (Date.now() - startTime) / 1000
        const st = stateRef.current
        trackEvent('wizard_abandon', '/create-listing', {
          last_step: 3,
          last_step_name: 'pricing',
          time_on_step_secs: Math.round(duration)
        })
        trackFieldInteract('/create-listing', 3, 'quantity', !!st.quantity)
        trackFieldInteract('/create-listing', 3, 'unit', !!st.unit)
        trackFieldInteract('/create-listing', 3, 'price', !!st.priceUsd)
      }
    }

    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      if (!wentNext.current && !wentBack.current) {
        const duration = (Date.now() - startTime) / 1000
        if (duration < 0.5) return

        const st = stateRef.current
        trackEvent('wizard_abandon', '/create-listing', {
          last_step: 3,
          last_step_name: 'pricing',
          time_on_step_secs: Math.round(duration)
        })
        trackFieldInteract('/create-listing', 3, 'quantity', !!st.quantity)
        trackFieldInteract('/create-listing', 3, 'unit', !!st.unit)
        trackFieldInteract('/create-listing', 3, 'price', !!st.priceUsd)
      }
    }
  }, [])

  // AI Price Progress States
  const [priceProgressStep, setPriceProgressStep] = useState(0)
  const priceProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Scroll to top when entering this step
  useEffect(() => {
    const el = document.querySelector('[class*="wizardContent"]') || document.querySelector('[class*="wizard"]')
    if (el) el.scrollTop = 0
    window.scrollTo(0, 0)
  }, [])

  const handleSuggestPrice = async () => {
    if (!state.name || state.name.trim().length < 3 || state.isFree) return;
    trackAiUsage('/create-listing', 'clicked', 'price_suggestion')
    setSuggestingPrice(true);
    setSuggestedPrice(null);

    setPriceProgressStep(1)
    priceProgressTimerRef.current = setInterval(() => {
      setPriceProgressStep(prev => Math.min(prev + 1, 3))
    }, 1500)

    try {
      const trimmed = state.name.trim();
      const res = await supabase.functions.invoke('suggest-product-price', {
        body: { name: trimmed, state: state.state_code, city: state.city, unit: state.unit }
      });
      
      if (res.data && typeof res.data.price_usd === 'number' && !res.data.error) {
        setSuggestedPrice(res.data);
        trackAiUsage('/create-listing', 'applied', 'price_suggestion')
      }
    } catch (err) {
      console.warn('Price suggestion failed:', err);
      trackAiUsage('/create-listing', 'dismissed', 'price_suggestion')
    } finally {
      if (priceProgressTimerRef.current) clearInterval(priceProgressTimerRef.current)
      setPriceProgressStep(0)
      setSuggestingPrice(false);
    }
  };

  // Clear suggestion if unit changes so they can fetch a new one
  useEffect(() => {
    setSuggestedPrice(null);
  }, [state.unit]);

  const validateAndNext = () => {
    trackEvent('button_click', '/create-listing', { step: 3, button: 'next' })
    trackFieldInteract('/create-listing', 3, 'quantity', !!state.quantity)
    trackFieldInteract('/create-listing', 3, 'unit', !!state.unit)
    trackFieldInteract('/create-listing', 3, 'price', !!state.priceUsd)

    const newErrors: Record<string, string> = {}
    if (!state.quantity) newErrors.quantity = 'Quantity is required'
    if (!state.isFree && !state.priceUsd) {
      newErrors.price = 'Price is required unless marked as free'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      trackEvent('wizard_validation_error', '/create-listing', {
        step: 3,
        fields: Object.keys(newErrors)
      })
      setTimeout(() => {
        const firstError = document.querySelector(`.${styles.errorText}`)
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return
    }

    // Skip Step 4 (Verification) if the user is already authenticated or verified OTP
    trackFieldInteract('/create-listing', 3, 'next_button', true)
    wentNext.current = true
    if (isAuthenticated || state.isExistingUser) {
      updateState({ currentStep: 5 })
    } else {
      nextStep()
    }
  }

  return (
    <div>
      <div className={styles.headerTop}>
        <button className={styles.backBtn} onClick={() => { wentBack.current = true; prevStep() }}>← Back</button>
      </div>
      
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Set Your Price</h2>
      
      <div className={styles.formGroup}>
        <label className={styles.label}>Available Quantity</label>
        <div style={{ display: 'flex', gap: 12 }}>
          <input 
            type="number"
            className={styles.input} 
            value={state.quantity || ''} 
            onChange={(e) => updateState({ quantity: e.target.value })}
            onBlur={() => trackFieldInteract('/create-listing', 3, 'quantity', !!state.quantity)}
            style={{ flex: 1 }}
          />
          <select 
            className={styles.input} 
            value={state.unit || 'each'} 
            onChange={(e) => {
              updateState({ unit: e.target.value })
              trackFieldInteract('/create-listing', 3, 'unit', !!e.target.value)
            }}
            style={{ width: 120 }}
          >
            {['each', 'bunch', 'dozen', 'jar', 'loaf', 'bag', 'box', 'basket'].map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        {errors.quantity && <div className={styles.errorText}>{errors.quantity}</div>}
      </div>

      <div className={styles.formGroup} style={{ marginBottom: 16 }}>
        <label className={styles.label}>Price (per {state.unit || 'each'})</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <input 
            type="number"
            className={styles.input} 
            value={state.priceUsd} 
            onChange={(e) => updateState({ priceUsd: e.target.value })}
            onBlur={() => trackFieldInteract('/create-listing', 3, 'price', !!state.priceUsd)}
            placeholder="$ 0.00"
            disabled={state.isFree}
            style={{ width: 140 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={state.isFree}
              onChange={(e) => {
                updateState({ isFree: e.target.checked })
                if (e.target.checked) updateState({ priceUsd: '0' })
              }}
              style={{ width: 20, height: 20, accentColor: '#16a34a' }}
            />
            <span style={{ fontWeight: 600, fontSize: 14, color: '#4b5563' }}>Give away for free</span>
          </label>
        </div>
      </div>
      
      {errors.price && <div className={styles.errorText} style={{ marginBottom: 16 }}>{errors.price}</div>}

      {(!suggestedPrice || suggestingPrice) && !state.isFree && (
        <>
        <button 
          type="button"
          className={styles.aiBtn} 
          style={{ 
            marginBottom: 24, 
            background: '#f3f4f6', 
            color: suggestingPrice ? '#9ca3af' : '#374151', 
            border: '1px solid #d1d5db',
            cursor: suggestingPrice ? 'wait' : 'pointer',
            opacity: suggestingPrice ? 0.7 : 1
          }}
          onClick={handleSuggestPrice}
          disabled={suggestingPrice}
        >
          {suggestingPrice ? '⏳ Calculating...' : '🪄 Get Price Suggestion'}
        </button>
        {suggestingPrice && priceProgressStep > 0 && (
          <div className={styles.aiProgressList}>
            {[{ step: 1, text: '📊 Looking up nearby prices...' }, { step: 2, text: '💰 Calculating average for your area...' }, { step: 3, text: '⏳ Gathering more data...' }].map(({ step, text }) => (
              <div key={step} className={`${styles.aiProgressStep} ${priceProgressStep > step ? styles.aiProgressDone : priceProgressStep === step ? styles.aiProgressActive : styles.aiProgressPending}`}>
                <span className={styles.aiProgressIcon}>{priceProgressStep > step ? '✅' : priceProgressStep === step ? '⏳' : '○'}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        )}
        </>
      )}

      {suggestedPrice && !suggestingPrice && !state.isFree && (
        <button 
          type="button"
          className={styles.aiBtn} 
          style={{ marginBottom: 24 }}
          onClick={() => {
            updateState({ priceUsd: suggestedPrice.price_usd.toString(), unit: suggestedPrice.unit });
            trackFieldInteract('/create-listing', 3, 'price', true);
            trackFieldInteract('/create-listing', 3, 'unit', true);
          }}
        >
          💡 {suggestedPrice.source === 'neighborhood_average' ? 'Avg nearby' : 'Suggested'}: ${suggestedPrice.price_usd.toFixed(2)}/{suggestedPrice.unit} — tap to use
        </button>
      )}

      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInner}>
          <button className={styles.btnPrimary} onClick={validateAndNext}>
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
