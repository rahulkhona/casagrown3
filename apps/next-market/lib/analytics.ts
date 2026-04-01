'use client'

import { createClient } from './supabase'

// ============================================================================
// Lightweight Analytics for CasaGrown Market
//
// Tracks: page views, button clicks, form submissions, errors
// Uses: Supabase user_analytics table (no third-party SDK)
// Tracing: session_id + txn_id for request correlation
// ============================================================================

let _sessionId: string | null = null
let _txnId: string | null = null
let _userId: string | null = null

function uuid() {
  // crypto.randomUUID() is only available in secure contexts (HTTPS or localhost).
  // When testing via LAN IP (e.g. 192.168.x.x:3001), fall back to Math.random.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Detect if running as installed PWA (standalone display mode) */
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari doesn't support display-mode media query
    (window.navigator as any).standalone === true
  )
}

/** Parse OS from user agent string */
export function detectOS(): string {
  if (typeof navigator === 'undefined') return 'Unknown'
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux/.test(ua)) return 'Linux'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  return 'Other'
}

/** Get or create session ID (persists across page loads in same tab) */
export function getSessionId(): string {
  if (_sessionId) return _sessionId
  if (typeof window !== 'undefined') {
    _sessionId = sessionStorage.getItem('cg_session_id')
    if (!_sessionId) {
      _sessionId = uuid()
      sessionStorage.setItem('cg_session_id', _sessionId)
    }
  } else {
    _sessionId = uuid()
  }
  return _sessionId
}

/** Get or create transaction ID (new per page navigation) */
export function getTransactionId(): string {
  if (!_txnId) _txnId = uuid()
  return _txnId
}

/** Reset transaction ID (call on route change) */
export function resetTransactionId(): void {
  _txnId = uuid()
}

/** Set the current user ID for analytics */
export function setAnalyticsUser(userId: string | null): void {
  _userId = userId
}

/** Core tracking function — inserts into user_analytics table */
export async function trackEvent(
  eventType: 'page_view' | 'button_click' | 'form_submit' | 'error',
  eventName: string,
  metadata?: Record<string, any>
): Promise<void> {
  // Don't block UI — fire and forget
  try {
    if (typeof window === 'undefined') return
    if (!_userId) return // Only track authenticated users

    const supabase = createClient()
    await supabase.from('user_analytics').insert({
      user_id: _userId,
      session_id: getSessionId(),
      txn_id: getTransactionId(),
      event_type: eventType,
      event_name: eventName,
      page_path: window.location.pathname,
      metadata: { is_pwa: isPWA(), os: detectOS(), ...(metadata || {}) },
      user_agent: navigator.userAgent,
      // Columns used by metrics dashboard RPCs
      element_id: metadata?.elementId || null,
      element_label: metadata?.elementLabel || null,
      stack_trace: metadata?.stackTrace || null,
    })
  } catch {
    // Silently fail — analytics should never break the app
  }
}

/** Track a page view */
export function trackPageView(path: string): void {
  resetTransactionId()
  trackEvent('page_view', path, { referrer: document.referrer })
}

/** Track a button click */
export function trackClick(buttonName: string, metadata?: Record<string, any>): void {
  trackEvent('button_click', buttonName, {
    ...metadata,
    elementId: metadata?.elementId || buttonName,
    elementLabel: metadata?.elementLabel || buttonName,
  })
}

/** Track a form submission */
export function trackFormSubmit(formName: string, metadata?: Record<string, any>): void {
  trackEvent('form_submit', formName, metadata)
}

/** Track an error */
export function trackError(errorName: string, metadata?: Record<string, any>): void {
  trackEvent('error', errorName, {
    ...metadata,
    stackTrace: metadata?.stackTrace || metadata?.stack || null,
  })
}
