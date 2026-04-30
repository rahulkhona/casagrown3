'use client'
import React, { useState } from 'react'
import { useWizard } from './WizardContext'
import styles from './wizard.module.css'
import { createClient } from '../../../lib/supabase'

export default function Step4Verification() {
  const { state, updateState, nextStep, prevStep } = useWizard()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const supabase = createClient()

  const handleSendOtp = async () => {
    const newErrors: Record<string, string> = {}
    if (!state.fullName.trim()) newErrors.fullName = 'Full Name is required'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsSendingOtp(true)
    const { error } = await supabase.auth.signInWithOtp({ email: state.email.toLowerCase() })
    setIsSendingOtp(false)

    if (error) {
      setErrors({ submit: error.message })
    } else {
      setOtpSent(true)
    }
  }

  const handleVerifyOtp = async () => {
    setIsVerifying(true)
    const { data, error } = await supabase.auth.verifyOtp({ 
      email: state.email.toLowerCase(), 
      token: otpCode, 
      type: 'email' 
    })
    setIsVerifying(false)

    if (error) {
      setOtpError(error.message)
    } else {
      nextStep()
    }
  }

  return (
    <div>
      <div className={styles.headerTop}>
        <button className={styles.backBtn} onClick={prevStep}>← Back</button>
      </div>
      
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Secure Your Listing</h2>
      <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>Create an account to publish and manage your produce stand.</p>
      
      <div className={styles.formGroup}>
        <label className={styles.label}>Email Address</label>
        <input 
          type="email"
          className={styles.input} 
          value={state.email} 
          disabled
          style={{ background: '#f3f4f6' }}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Full Name</label>
        <input 
          className={styles.input} 
          value={state.fullName} 
          onChange={(e) => updateState({ fullName: e.target.value })}
          placeholder="Jane Doe"
          disabled={otpSent}
        />
        {errors.fullName && <div className={styles.errorText}>{errors.fullName}</div>}
      </div>

      {errors.submit && <div className={styles.errorText} style={{ marginBottom: 16 }}>{errors.submit}</div>}

      {otpSent && (
        <div style={{ background: '#f0fdf4', padding: 20, borderRadius: 24, marginTop: 32, border: '1px solid #bbf7d0' }}>
          <h4 style={{ marginBottom: 12, color: '#15803d', fontWeight: 600 }}>Verify Your Email</h4>
          <p style={{ fontSize: 13, marginBottom: 16, color: '#166534' }}>We sent a 6-digit code to {state.email}</p>
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

      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInner}>
          {!otpSent ? (
            <button className={styles.btnPrimary} onClick={handleSendOtp} disabled={isSendingOtp}>
              {isSendingOtp ? 'Sending...' : 'Send Verification Code'}
            </button>
          ) : (
            <button className={styles.btnPrimary} onClick={handleVerifyOtp} disabled={isVerifying}>
              {isVerifying ? 'Verifying...' : 'Verify & Continue →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
