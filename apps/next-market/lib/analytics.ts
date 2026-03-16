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
  return crypto.randomUUID()
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
      metadata: metadata || {},
      user_agent: navigator.userAgent,
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
  trackEvent('button_click', buttonName, metadata)
}

/** Track a form submission */
export function trackFormSubmit(formName: string, metadata?: Record<string, any>): void {
  trackEvent('form_submit', formName, metadata)
}

/** Track an error */
export function trackError(errorName: string, metadata?: Record<string, any>): void {
  trackEvent('error', errorName, metadata)
}
