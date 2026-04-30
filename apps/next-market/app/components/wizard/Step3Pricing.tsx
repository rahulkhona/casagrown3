'use client'
import React, { useState, useEffect } from 'react'
import { useWizard } from './WizardContext'
import styles from './wizard.module.css'
import { createClient } from '../../../lib/supabase'

export default function Step3Pricing() {
  const { state, updateState, nextStep, prevStep, isAuthenticated } = useWizard()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [suggestedPrice, setSuggestedPrice] = useState<{ price_usd: number; unit: string; source: string } | null>(null)
  const [suggestingPrice, setSuggestingPrice] = useState(false)
  const supabase = createClient()

  const handleSuggestPrice = async () => {
    if (!state.name || state.name.trim().length < 3 || state.isFree) return;
    setSuggestingPrice(true);
    setSuggestedPrice(null);
    try {
      const trimmed = state.name.trim();
      const res = await supabase.functions.invoke('suggest-product-price', {
        body: { name: trimmed, state: state.state_code, city: state.city, unit: state.unit }
      });
      
      if (res.data && typeof res.data.price_usd === 'number' && !res.data.error) {
        setSuggestedPrice(res.data);
      }
    } catch (err) {
      console.warn('Price suggestion failed:', err);
    } finally {
      setSuggestingPrice(false);
    }
  };

  // Clear suggestion if unit changes so they can fetch a new one
  useEffect(() => {
    setSuggestedPrice(null);
  }, [state.unit]);

  const validateAndNext = () => {
    const newErrors: Record<string, string> = {}
    if (!state.quantity) newErrors.quantity = 'Quantity is required'
    if (!state.isFree && !state.priceUsd) {
      newErrors.price = 'Price is required unless marked as free'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Skip Step 4 (Verification) if the user is already authenticated
    if (state.isExistingUser && isAuthenticated) {
      updateState({ currentStep: 5 })
    } else {
      nextStep()
    }
  }

  return (
    <div>
      <div className={styles.headerTop}>
        <button className={styles.backBtn} onClick={prevStep}>← Back</button>
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
            style={{ flex: 1 }}
          />
          <select 
            className={styles.input} 
            value={state.unit || 'each'} 
            onChange={(e) => updateState({ unit: e.target.value })}
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
      )}

      {suggestedPrice && !suggestingPrice && !state.isFree && (
        <button 
          type="button"
          className={styles.aiBtn} 
          style={{ marginBottom: 24 }}
          onClick={() => {
            updateState({ priceUsd: suggestedPrice.price_usd.toString(), unit: suggestedPrice.unit });
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
