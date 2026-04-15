'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useMarketingAnalytics, trackEvent, markConverted } from '../../../lib/crm-analytics'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// All useSearchParams usage is inside JoinContent which is wrapped in Suspense at page level
function JoinContent() {
  const searchParams = useSearchParams()
  const intent = searchParams.get('intent') ?? 'buyer' // 'buyer' | 'seller'

  useMarketingAnalytics('/join')

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    accepts_email: true,
    accepts_sms: false,
    intent,
  })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [formStarted, setFormStarted] = useState(false)

  const handleFocus = () => {
    if (!formStarted) {
      trackEvent('form_start', '/join', { intent })
      setFormStarted(true)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'submitting') return

    setStatus('submitting')

    // Collect UTM params from URL
    const params = new URLSearchParams(window.location.search)
    const payload = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      source_platform: params.get('utm_source') || 'direct',
      source_url: window.location.href,
      utm_campaign: params.get('utm_campaign') || null,
      utm_content: params.get('utm_content') || null,
      utm_medium: params.get('utm_medium') || null,
      form_version: 'v1-join',
      accepts_email: form.accepts_email,
      accepts_sms: form.accepts_sms,
      metadata: { intent: form.intent },
    }

    try {
      // Primary path: direct Supabase REST insert (works in all environments)
      const sbRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/crm_leads`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
            'Prefer': 'return=minimal',  // anon can INSERT but not SELECT — use minimal
          },
          body: JSON.stringify(payload),
        }
      )
      if (!sbRes.ok) throw new Error('Failed to save your info. Please try again.')
      // No lead ID available with return=minimal — that's fine for anon submissions

      // Enhancement: also call edge fn if available (fire-and-forget)
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/receive-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify(payload),
      }).catch(() => { /* ignore edge fn errors */ })

      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      trackEvent('form_abandon', '/join', { reason: 'submit_error', intent })
    }
  }

  if (status === 'success') {
    return (
      <div className="join-success">
        <div className="join-success-icon">🎉</div>
        <h2>You're on the list!</h2>
        <p>
          {intent === 'seller'
            ? "We'll send you everything you need to set up your booth and start earning."
            : "We'll let you know as soon as fresh produce is available in your area."}
        </p>
        <Link href="/market" className="marketing-btn-primary" style={{ marginTop: 24 }}>
          Browse the Market Now →
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="join-form" noValidate>
      <div className="join-form-group">
        <label htmlFor="join-name">Full Name *</label>
        <input
          id="join-name"
          type="text"
          placeholder="Your name"
          required
          value={form.name}
          onFocus={handleFocus}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div className="join-form-group">
        <label htmlFor="join-email">Email Address</label>
        <input
          id="join-email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onFocus={handleFocus}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>

      <div className="join-form-group">
        <label htmlFor="join-phone">Phone (optional — for SMS updates)</label>
        <input
          id="join-phone"
          type="tel"
          placeholder="+1 (555) 000-0000"
          value={form.phone}
          onFocus={handleFocus}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </div>

      <div className="join-form-checkboxes">
        <label className="join-checkbox-label">
          <input
            type="checkbox"
            checked={form.accepts_email}
            onChange={(e) => setForm({ ...form, accepts_email: e.target.checked })}
          />
          <span>Send me updates by email</span>
        </label>
        <label className="join-checkbox-label">
          <input
            type="checkbox"
            checked={form.accepts_sms}
            onChange={(e) => setForm({ ...form, accepts_sms: e.target.checked })}
          />
          <span>Send me updates by text message</span>
        </label>
      </div>

      {status === 'error' && (
        <p className="join-error">{errorMsg}</p>
      )}

      <button
        id="join-submit-btn"
        type="submit"
        className="marketing-btn-primary join-submit"
        disabled={status === 'submitting' || !form.name}
      >
        {status === 'submitting' ? 'Joining...' : intent === 'seller' ? 'Start My Seller Journey →' : 'Join CasaGrown Free →'}
      </button>

      <p className="join-disclaimer">
        No spam. Unsubscribe anytime. We will never share your information.
      </p>
    </form>
  )
}

export default function JoinPage() {
  return (
    <div className="marketing-root">
      <nav className="marketing-nav">
        <Link href="/" className="marketing-logo">🌱 CasaGrown</Link>
        <div className="marketing-nav-links">
          <Link href="/market">Browse Market</Link>
          <Link href="/sellers">For Sellers</Link>
        </div>
      </nav>

      <Suspense fallback={<div className="join-loading" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
        <JoinContent />
      </Suspense>

      <style jsx>{`
        .marketing-root { min-height: 100vh; background: #0a0f0a; color: #f0faf0; font-family: 'Inter', system-ui, sans-serif; }
        .marketing-nav { display: flex; align-items: center; justify-content: space-between; padding: 20px 48px; background: rgba(10,15,10,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(120,200,100,0.12); }
        .marketing-logo { font-size: 1.4rem; font-weight: 700; color: #7ec85a; text-decoration: none; }
        .marketing-nav-links { display: flex; align-items: center; gap: 32px; }
        .marketing-nav-links a { color: #a0bfa0; text-decoration: none; }
        .join-container { display: grid; grid-template-columns: 1fr 1fr; min-height: calc(100vh - 80px); }
        .join-content { padding: 80px 64px; background: linear-gradient(135deg, rgba(74,222,128,0.04), transparent); display: flex; flex-direction: column; justify-content: center; }
        .join-header { max-width: 480px; }
        .marketing-hero-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(120,200,80,0.12); border: 1px solid rgba(120,200,80,0.25); border-radius: 100px; padding: 6px 16px; font-size: 0.85rem; color: #7ec85a; font-weight: 500; margin-bottom: 24px; }
        .join-title { font-size: clamp(2rem, 4vw, 3.2rem); font-weight: 800; line-height: 1.15; margin-bottom: 20px; white-space: pre-line; }
        .join-subtitle { font-size: 1.1rem; color: #8aac8a; line-height: 1.7; margin-bottom: 32px; }
        .join-benefits { display: flex; flex-direction: column; gap: 10px; }
        .join-benefit { color: #c0d8c0; font-size: 0.95rem; }
        /* Form */
        .join-form-container { display: flex; align-items: center; justify-content: center; padding: 48px; background: rgba(255,255,255,0.02); border-left: 1px solid rgba(120,200,80,0.08); }
        .join-form-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(120,200,80,0.15); border-radius: 28px; padding: 48px; width: 100%; max-width: 440px; }
        .join-form-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 32px; }
        .join-form { display: flex; flex-direction: column; gap: 20px; }
        .join-form-group { display: flex; flex-direction: column; gap: 8px; }
        .join-form-group label { font-size: 0.85rem; color: #8aac8a; font-weight: 500; }
        .join-form-group input {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(120,200,80,0.2);
          border-radius: 12px; padding: 14px 16px; color: #f0faf0; font-size: 1rem;
          outline: none; transition: border-color 0.2s;
        }
        .join-form-group input:focus { border-color: rgba(120,200,80,0.6); background: rgba(120,200,80,0.04); }
        .join-form-group input::placeholder { color: #4a6a4a; }
        .join-form-checkboxes { display: flex; flex-direction: column; gap: 12px; }
        .join-checkbox-label { display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 0.9rem; color: #8aac8a; }
        .join-checkbox-label input[type="checkbox"] { width: 18px; height: 18px; accent-color: #4ade80; }
        .join-error { color: #f87171; font-size: 0.9rem; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 12px; }
        .join-submit { width: 100%; justify-content: center; padding: 16px; font-size: 1rem; border-radius: 14px; transition: all 0.2s; }
        .join-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .marketing-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #4ade80, #22c55e); color: #052e16; font-weight: 700; border-radius: 12px; padding: 14px 28px; text-decoration: none; font-size: 1rem; transition: all 0.2s; box-shadow: 0 4px 24px rgba(74,222,128,0.2); border: none; cursor: pointer; }
        .marketing-btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(74,222,128,0.3); }
        .join-disclaimer { font-size: 0.8rem; color: #4a6a4a; text-align: center; }
        .join-success { text-align: center; padding: 24px 0; }
        .join-success-icon { font-size: 3rem; margin-bottom: 16px; }
        .join-success h2 { font-size: 1.8rem; font-weight: 700; margin-bottom: 16px; }
        .join-success p { color: #8aac8a; line-height: 1.6; margin-bottom: 8px; }
        .join-loading { color: #6a8c6a; text-align: center; padding: 24px; }
        @media (max-width: 768px) {
          .join-container { grid-template-columns: 1fr; }
          .join-content { padding: 48px 24px; }
          .join-form-container { padding: 24px; border-left: none; border-top: 1px solid rgba(120,200,80,0.08); }
        }
      `}</style>
    </div>
  )
}
