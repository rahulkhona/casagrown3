'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { createClient } from '../../lib/supabase'

// ─── Types ──────────────────────────────────────────────────────
interface Toast {
  id: string
  message: string
  type: 'error' | 'warning' | 'info' | 'success'
  context?: Record<string, any>
}

interface ErrorToastContextType {
  showError: (message: string, context?: Record<string, any>) => void
  showWarning: (message: string) => void
  showSuccess: (message: string) => void
  showInfo: (message: string) => void
}

const ErrorToastContext = createContext<ErrorToastContextType>({
  showError: () => {},
  showWarning: () => {},
  showSuccess: () => {},
  showInfo: () => {},
})

export const useErrorToast = () => useContext(ErrorToastContext)

// ─── Provider ────────────────────────────────────────────────────
export function ErrorToastProvider({ children, userId }: { children: React.ReactNode; userId?: string }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [reporting, setReporting] = useState<string | null>(null)
  const [reported, setReported] = useState<Set<string>>(new Set())
  const toastIdRef = useRef(0)

  // ── Feedback FAB state ──
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'improvement'>('feature')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)

  const addToast = useCallback((message: string, type: Toast['type'], context?: Record<string, any>) => {
    const id = `toast-${++toastIdRef.current}`
    setToasts(prev => [...prev, { id, message, type, context }])
    const timeout = type === 'error' ? 8000 : 4000
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, timeout)
  }, [])

  const showError = useCallback((message: string, context?: Record<string, any>) => addToast(message, 'error', context), [addToast])
  const showWarning = useCallback((message: string) => addToast(message, 'warning'), [addToast])
  const showSuccess = useCallback((message: string) => addToast(message, 'success'), [addToast])
  const showInfo = useCallback((message: string) => addToast(message, 'info'), [addToast])

  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  // ── Submit feedback (bug report from toast or general feedback) ──
  const submitFeedback = async (type: string, message: string, context?: Record<string, any>, toastId?: string) => {
    if (!userId) { alert('Please sign in to submit feedback.'); return }

    const setLoading = toastId ? () => setReporting(toastId) : () => setFeedbackSending(true)
    setLoading()

    try {
      const supabase = createClient()
      const { error } = await supabase.from('user_feedback').insert({
        reporter_id: userId,
        type,
        message,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        extra_context: {
          ...context,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: new Date().toISOString(),
          platform: navigator.platform,
        },
      })

      if (error) {
        console.error('Feedback submit failed:', error)
        alert('Failed to submit: ' + error.message)
      } else {
        if (toastId) {
          setReported(prev => { const next = new Set(Array.from(prev)); next.add(toastId); return next })
          setTimeout(() => dismissToast(toastId), 2000)
        } else {
          setFeedbackSent(true)
          setFeedbackMessage('')
          setTimeout(() => { setFeedbackOpen(false); setFeedbackSent(false) }, 2000)
        }
      }
    } catch (err: any) {
      alert('Failed: ' + (err.message || 'Unknown error'))
    } finally {
      if (toastId) setReporting(null)
      else setFeedbackSending(false)
    }
  }

  const typeStyles: Record<Toast['type'], { bg: string; border: string; icon: string; color: string }> = {
    error:   { bg: '#fef2f2', border: '#fca5a5', icon: '❌', color: '#991b1b' },
    warning: { bg: '#fffbeb', border: '#fcd34d', icon: '⚠️', color: '#92400e' },
    info:    { bg: '#eff6ff', border: '#93c5fd', icon: 'ℹ️', color: '#1e40af' },
    success: { bg: '#f0fdf4', border: '#86efac', icon: '✅', color: '#166534' },
  }

  const feedbackTypeConfig = {
    bug:         { icon: '🐛', label: 'Bug Report', color: '#dc2626' },
    feature:     { icon: '💡', label: 'Feature Idea', color: '#7c3aed' },
    improvement: { icon: '✨', label: 'Improvement', color: '#0891b2' },
  }

  return (
    <ErrorToastContext.Provider value={{ showError, showWarning, showSuccess, showInfo }}>
      {children}

      {/* ── Toast Stack ── */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 8,
          width: 'min(90vw, 420px)', pointerEvents: 'none',
        }}>
          {toasts.map(toast => {
            const s = typeStyles[toast.type]
            const isReporting = reporting === toast.id
            const isReported = reported.has(toast.id)

            return (
              <div key={toast.id} style={{
                background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12,
                padding: '12px 16px', boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                pointerEvents: 'auto', animation: 'toastSlideIn 0.3s ease-out',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
                  <p style={{ margin: 0, flex: 1, fontSize: 13, lineHeight: 1.45, color: s.color, wordBreak: 'break-word' }}>
                    {toast.message}
                  </p>
                  <button onClick={() => dismissToast(toast.id)} style={{ background: 'none', border: 'none', color: s.color, cursor: 'pointer', fontSize: 16, padding: '0 2px', opacity: 0.6, flexShrink: 0 }}>✕</button>
                </div>

                {toast.type === 'error' && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {isReported ? (
                      <span style={{ fontSize: 12, color: '#166534', fontWeight: 600, padding: '4px 10px' }}>✅ Reported — thank you!</span>
                    ) : (
                      <button
                        onClick={() => submitFeedback('bug', toast.message, toast.context, toast.id)}
                        disabled={isReporting}
                        style={{
                          background: isReporting ? '#e5e7eb' : '#fff',
                          border: `1px solid ${s.border}`, borderRadius: 20,
                          padding: '4px 12px', fontSize: 12, fontWeight: 600,
                          color: isReporting ? '#9ca3af' : '#dc2626',
                          cursor: isReporting ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {isReporting ? <>⏳ Reporting...</> : <>🐛 Report Bug</>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Floating Feedback FAB ── */}
      {userId && !feedbackOpen && (
        <button
          onClick={() => setFeedbackOpen(true)}
          style={{
            position: 'fixed', bottom: 80, right: 16, zIndex: 9990,
            width: 48, height: 48, borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            border: 'none', color: '#fff', fontSize: 20,
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          aria-label="Send Feedback"
          title="Send Feedback"
        >
          📣
        </button>
      )}

      {/* ── Feedback Modal ── */}
      {feedbackOpen && (
        <>
          <div onClick={() => { setFeedbackOpen(false); setFeedbackSent(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9991 }} />
          <div style={{
            position: 'fixed', bottom: 80, right: 16, zIndex: 9992,
            width: 'min(92vw, 360px)',
            background: '#fff', borderRadius: 16,
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
            animation: 'toastSlideIn 0.25s ease-out',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '14px 16px 10px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Send Feedback</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>Help us improve CasaGrown</div>
              </div>
              <button onClick={() => { setFeedbackOpen(false); setFeedbackSent(false) }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: 0.8 }}>✕</button>
            </div>

            {feedbackSent ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#166534' }}>Thank you!</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>Your feedback has been submitted.</p>
              </div>
            ) : (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Type selector chips */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {(Object.keys(feedbackTypeConfig) as Array<keyof typeof feedbackTypeConfig>).map(t => {
                    const cfg = feedbackTypeConfig[t]
                    const active = feedbackType === t
                    return (
                      <button
                        key={t}
                        onClick={() => setFeedbackType(t)}
                        style={{
                          flex: 1, padding: '8px 6px', borderRadius: 10,
                          border: `1.5px solid ${active ? cfg.color : '#e5e7eb'}`,
                          background: active ? `${cfg.color}10` : '#fff',
                          cursor: 'pointer', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', gap: 2, transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: active ? cfg.color : '#6b7280' }}>{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Message input */}
                <textarea
                  placeholder={
                    feedbackType === 'bug' ? "What went wrong? Describe what happened..." :
                    feedbackType === 'feature' ? "What feature would you like to see?" :
                    "What could work better?"
                  }
                  value={feedbackMessage}
                  onChange={e => setFeedbackMessage(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
                    borderRadius: 10, fontSize: 13, fontFamily: 'inherit',
                    resize: 'vertical', outline: 'none', lineHeight: 1.45,
                    boxSizing: 'border-box',
                  }}
                />

                {/* Context hint */}
                <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                  📍 Current page will be attached automatically
                </div>

                {/* Submit */}
                <button
                  onClick={() => submitFeedback(feedbackType, feedbackMessage)}
                  disabled={!feedbackMessage.trim() || feedbackSending}
                  style={{
                    width: '100%', padding: '10px 16px', borderRadius: 10,
                    background: feedbackSending || !feedbackMessage.trim() ? '#e5e7eb' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    border: 'none', color: feedbackSending || !feedbackMessage.trim() ? '#9ca3af' : '#fff',
                    cursor: feedbackSending || !feedbackMessage.trim() ? 'not-allowed' : 'pointer',
                    fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
                  }}
                >
                  {feedbackSending ? '⏳ Sending...' : 'Submit Feedback'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ErrorToastContext.Provider>
  )
}
