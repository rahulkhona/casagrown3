'use client'
import React, { useState, useEffect } from 'react'
import { useWizard } from './WizardContext'
import styles from './wizard.module.css'
import { useNotificationPrompt } from '../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../NotificationPromptModal'
import { createClient } from '../../../lib/supabase'
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '../../(main)/terms/page'
import { useErrorToast } from '../ErrorToast'

export default function Step5Publish() {
  const { state, updateState, nextStep, prevStep, saveProductToDatabase, checkQuarantine } = useWizard()
  const { showError } = useErrorToast()
  const [isPublishing, setIsPublishing] = useState(false)
  const [userId, setUserId] = useState<string | undefined>()
  const [modalContent, setModalContent] = useState<'tos' | 'privacy' | null>(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  
  // SMS Verification States
  const [isSendingSmsOtp, setIsSendingSmsOtp] = useState(false)
  const [smsOtpSent, setSmsOtpSent] = useState(false)
  const [smsOtpCode, setSmsOtpCode] = useState('')
  const [isVerifyingSms, setIsVerifyingSms] = useState(false)
  const [smsVerified, setSmsVerified] = useState(false)

  const supabase = createClient()

  const { showPrompt, modalProps } = useNotificationPrompt(userId)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      if (data.user) {
        setUserId(data.user.id)
        if (data.user.phone) {
          updateState({ phoneNumber: data.user.phone })
          setSmsVerified(true)
        }
      }
    })
  }, [supabase])

  useEffect(() => {
    const checkPush = () => {
      if (typeof Notification !== 'undefined') setPushEnabled(Notification.permission === 'granted')
    }
    checkPush()
    window.addEventListener('focus', checkPush)
    const interval = setInterval(checkPush, 1000)
    
    // Check quarantine on mount
    checkQuarantine()
    
    return () => {
      window.removeEventListener('focus', checkPush)
      clearInterval(interval)
    }
  }, [])

  const handleSendSmsOtp = async () => {
    setIsSendingSmsOtp(true)
    const { error } = await supabase.auth.updateUser({ phone: state.phoneNumber })
    setIsSendingSmsOtp(false)
    if (!error) {
      setSmsOtpSent(true)
    } else {
      showError(error.message)
    }
  }

  const handleVerifySmsOtp = async () => {
    setIsVerifyingSms(true)
    const { error } = await supabase.auth.verifyOtp({ phone: state.phoneNumber, token: smsOtpCode, type: 'phone_change' })
    setIsVerifyingSms(false)
    if (!error) {
      setSmsVerified(true)
      setSmsOtpSent(false)
    } else {
      showError(error.message)
    }
  }

  const handlePublish = async () => {
    setIsPublishing(true)
    try {
      await saveProductToDatabase(false)
      nextStep()
    } catch (err: any) {
      showError(err.message)
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div>
      <div className={styles.headerTop}>
        <button className={styles.backBtn} onClick={prevStep}>← Back</button>
      </div>
      
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Review Your Listing</h2>
      
      <div style={{ background: 'white', borderRadius: 24, padding: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 80, height: 80, background: '#f3f4f6', borderRadius: 12, overflow: 'hidden' }}>
            {state.photos && state.photos.length > 0 ? (
              <img src={state.photos[0]} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#dcfce7', color: '#16a34a', fontSize: 32 }}>🌱</div>
            )}
          </div>
          <div>
            <h3 style={{ marginBottom: 4, fontWeight: 700 }}>{state.name || 'Your Product'}</h3>
            <p style={{ color: '#16a34a', fontWeight: 700, marginBottom: 4 }}>
              {state.isFree ? 'Free' : `$${state.priceUsd} / ${state.unit}`}
            </p>
            <p style={{ fontSize: 13, color: '#6b7280' }}>{state.quantity} available</p>
          </div>
        </div>
        <div style={{ paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
          {state.offersDelivery && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🚗 Delivery — {state.deliveryRadius}mi radius</p>
            </div>
          )}
          {state.offersPickup && (
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📍 Pickup</p>
            </div>
          )}
        </div>
      </div>

      {state.quarantineInfo && (
        <div style={{
          background: 'var(--amber-50, #fffbeb)', border: '1px solid var(--amber-300, #fcd34d)',
          borderRadius: 24, padding: '16px 20px', marginBottom: 24, fontSize: 14,
          color: 'var(--amber-800, #92400e)', display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{ fontSize: 24, lineHeight: 1 }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#b45309' }}>Potential Agricultural Quarantine</h4>
            <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
              Based on your location, selling <strong>{state.category}</strong> may be quarantined in <strong>{state.quarantineInfo.county_name}</strong> due
              to <strong>{state.quarantineInfo.pest_name}</strong>.
            </p>
            {state.quarantineInfo.reason && (
              <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>{state.quarantineInfo.reason}</p>
            )}
            {state.quarantineInfo.source_url && (
              <a href={state.quarantineInfo.source_url} target="_blank" rel="noopener noreferrer" 
                 style={{ color: '#b45309', fontWeight: 600, textDecoration: 'underline' }}>
                Learn more at local Dept of Agriculture →
              </a>
            )}
          </div>
        </div>
      )}

      <div className={styles.formGroup}>
        <label className={styles.label}>Never Miss an Order!</label>
        
        <div 
          style={{ border: '1px solid #d1d5db', borderRadius: 24, padding: 16, background: pushEnabled ? '#f0fdf4' : 'white', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: pushEnabled ? 'default' : 'pointer', borderColor: pushEnabled ? '#16a34a' : '#d1d5db' }}
          onClick={() => { if (!pushEnabled) showPrompt(true) }}
        >
          <div style={{ fontSize: 24 }}>🔔</div>
          <div style={{ flex: 1 }}>
            <h4 style={{ fontWeight: 700 }}>Push Notifications</h4>
            <p style={{ fontSize: 13, color: '#4b5563' }}>Get instantly notified about new orders and buyer messages</p>
          </div>
          {pushEnabled ? (
            <div style={{ padding: '6px 12px', background: '#dcfce7', color: '#166534', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
              Enabled ✅
            </div>
          ) : (
            <div style={{ padding: '6px 16px', background: '#f3f4f6', borderRadius: 16, fontSize: 12, fontWeight: 600 }}>
              Setup
            </div>
          )}
        </div>

        <div 
          style={{ border: '1px solid #d1d5db', borderRadius: 24, padding: 16, background: state.smsEnabled ? '#f0fdf4' : 'white', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer', borderColor: state.smsEnabled ? '#16a34a' : '#d1d5db' }}
          onClick={() => updateState({ smsEnabled: !state.smsEnabled })}
        >
          <div style={{ fontSize: 24 }}>📱</div>
          <div style={{ flex: 1 }}>
            <h4 style={{ fontWeight: 700 }}>SMS Notifications</h4>
            <p style={{ fontSize: 13, color: '#4b5563' }}>Receive text messages for order updates</p>
          </div>
          <div style={{ width: 44, height: 24, background: state.smsEnabled ? '#22c55e' : '#d1d5db', borderRadius: 9999, position: 'relative', transition: 'all 0.2s' }}>
            <div style={{ width: 20, height: 20, background: 'white', borderRadius: '50%', position: 'absolute', top: 2, left: state.smsEnabled ? 22 : 2, transition: 'all 0.2s' }}></div>
          </div>
        </div>

        {state.smsEnabled && !smsVerified && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input 
              type="tel"
              className={styles.input} 
              value={state.phoneNumber} 
              onChange={(e) => updateState({ phoneNumber: e.target.value })}
              placeholder="(555) 123-4567"
              style={{ flex: 1, marginBottom: 0 }}
              disabled={smsOtpSent}
            />
            {state.phoneNumber && state.phoneNumber.length >= 10 && !smsOtpSent && (
               <button 
                 type="button"
                 onClick={handleSendSmsOtp}
                 style={{ padding: '0 16px', height: 44, borderRadius: 12, background: '#16a34a', color: 'white', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                 disabled={isSendingSmsOtp}
               >
                 {isSendingSmsOtp ? 'Sending...' : 'Verify'}
               </button>
            )}
          </div>
        )}

        {smsOtpSent && !smsVerified && (
          <div style={{ background: '#f0fdf4', padding: 16, borderRadius: 16, marginTop: 12, border: '1px solid #bbf7d0' }}>
            <p style={{ fontSize: 13, marginBottom: 12, color: '#166534' }}>Enter the 6-digit code sent to your phone</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <input 
                type="text" 
                value={smsOtpCode}
                onChange={(e) => setSmsOtpCode(e.target.value)}
                placeholder="123456"
                style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #16a34a', fontSize: 16, textAlign: 'center', letterSpacing: 4 }}
              />
              <button 
                type="button"
                onClick={handleVerifySmsOtp}
                style={{ padding: '0 16px', height: 48, borderRadius: 12, background: '#16a34a', color: 'white', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                disabled={isVerifyingSms || smsOtpCode.length < 6}
              >
                {isVerifyingSms ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {state.smsEnabled && smsVerified && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12 }}>
            <span style={{ fontSize: 18 }}>📱</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>{state.phoneNumber}</p>
              <p style={{ fontSize: 12, color: '#15803d' }}>Verified successfully</p>
            </div>
            <button 
               type="button"
               onClick={() => { setSmsVerified(false); updateState({ phoneNumber: '' }); setSmsOtpCode(''); setSmsOtpSent(false); }}
               style={{ fontSize: 13, color: '#16a34a', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Change
            </button>
          </div>
        )}
      </div>

      <NotificationPromptModal {...modalProps} />

      <div className={styles.bottomBar}>
        {!state.isExistingUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 16px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={state.agreedToTos}
              onChange={(e) => updateState({ agreedToTos: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: '#16a34a', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: '#4b5563' }}>
              I agree to the <button type="button" onClick={() => setModalContent('tos')} style={{ color: '#16a34a', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>Terms of Service</button> & <button type="button" onClick={() => setModalContent('privacy')} style={{ color: '#16a34a', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>Privacy Policy</button>
            </span>
          </div>
        )}
        <div className={styles.bottomBarInner} style={{ paddingTop: 0 }}>
          <button className={styles.btnPrimary} onClick={handlePublish} disabled={isPublishing || (!state.isExistingUser && !state.agreedToTos)}>
            {isPublishing ? 'Publishing...' : '🌱 Publish Product'}
          </button>
        </div>
      </div>

      {modalContent && (
        <>
          <div onClick={() => setModalContent(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10000, background: '#fff', borderRadius: 16, width: '90%', maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{modalContent === 'tos' ? 'Terms of Use' : 'Privacy Policy'}</h2>
              <button type="button" onClick={() => setModalContent(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {(modalContent === 'tos' ? TERMS_SECTIONS : PRIVACY_SECTIONS).map((section, si) => (
                <div key={si} style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, color: '#1f2937', marginBottom: 12, fontWeight: 700 }}>{section.title}</h3>
                  {section.paragraphs.map((p, pi) => (
                    <p key={pi} style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6, marginBottom: 12 }}>{p}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
