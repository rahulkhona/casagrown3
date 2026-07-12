'use client'

/**
 * CRM Analytics — client-side page visit tracking for marketing pages.
 *
 * Usage in any marketing page component:
 *   import { useMarketingAnalytics } from '@/lib/crm-analytics'
 *   export default function Page() {
 *     useMarketingAnalytics('/sellers')
 *     ...
 *   }
 *
 * Also exports trackEvent() for ad-hoc event tracking:
 *   trackEvent('button_click', '/sellers', { button: 'Join Now' })
 */

import { useEffect, useRef } from 'react'

/** Get or create a session ID from sessionStorage (survives page navigation, cleared on tab close) */
function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  const key = 'crm_session_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

/** Parse UTM params from the current URL */
function getUtmParams(): Record<string, string | null> {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  return {
    utm_source: params.get('utm_source'),
    utm_campaign: params.get('utm_campaign'),
    utm_content: params.get('utm_content'),
    utm_medium: params.get('utm_medium'),
  }
}

/** Send a beacon to /api/crm/track — uses sendBeacon for unload reliability */
function send(payload: Record<string, unknown>): void {
  const data = JSON.stringify(payload)
  const url = '/api/crm/track'
  // sendBeacon survives page unload; fetch is fine for regular events
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([data], { type: 'text/plain' }))
  } else {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data })
      .catch(() => { /* silent */ })
  }
}

/**
 * Hook: tracks a marketing page visit on mount and sends duration+status on unmount.
 * Call at the top of each marketing page component.
 */
export function useMarketingAnalytics(pageSlug: string): void {
  const startRef = useRef<number>(Date.now())
  const sessionId = getSessionId()

  useEffect(() => {
    if (!sessionId) return

    const utms = getUtmParams()
    startRef.current = Date.now()

    // Fire visit beacon on mount
    send({
      type: 'visit',
      session_id: sessionId,
      page_slug: pageSlug,
      referrer: document.referrer || null,
      ...utms,
    })

    // Send duration on unload
    const handleUnload = () => {
      const duration = Math.round((Date.now() - startRef.current) / 1000)
      send({
        type: 'update',
        session_id: sessionId,
        duration_secs: duration,
        converted: false, // updated to true by lead form on submit
      })
    }

    window.addEventListener('beforeunload', handleUnload)
    // Also handle visibilitychange for mobile background → close
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') handleUnload()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      handleUnload()
      window.removeEventListener('beforeunload', handleUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [pageSlug, sessionId])
}

/**
 * Track a specific interaction event on a marketing page.
 * Call this directly from event handlers.
 */
export function trackEvent(
  eventType:
    | 'button_click' | 'calculator_used' | 'form_start' | 'form_abandon'
    | 'cta_clicked' | 'scroll_50' | 'scroll_90' | 'wizard_step'
    | 'wizard_field_interact' | 'wizard_ai_used' | 'wizard_abandon'
    | 'wizard_validation_error' | 'wizard_step_timing',
  pageSlug: string,
  eventData: Record<string, unknown> = {},
): void {
  const sessionId = getSessionId()
  if (!sessionId) return
  send({
    type: 'event',
    session_id: sessionId,
    page_slug: pageSlug,
    event_type: eventType,
    event_data: eventData,
  })
}

/**
 * Track a wizard field interaction on blur.
 * Captures which fields users interact with and whether they contain a value.
 */
export function trackFieldInteract(
  pageSlug: string,
  step: number,
  fieldName: string,
  hasValue: boolean,
): void {
  trackEvent('wizard_field_interact', pageSlug, { step, field: fieldName, has_value: hasValue })
}

/**
 * Track AI feature usage in a wizard.
 * Records whether users click AI buttons, apply results, dismiss them, or abandon during wait.
 */
export function trackAiUsage(
  pageSlug: string,
  action: 'clicked' | 'applied' | 'dismissed' | 'abandon_wait',
  buttonName: string,
): void {
  trackEvent('wizard_ai_used', pageSlug, { action, button: buttonName })
}

/**
 * Track time spent on a wizard step (fired on step transition).
 */
export function trackStepTiming(
  pageSlug: string,
  step: number,
  stepName: string,
  durationSecs: number,
): void {
  trackEvent('wizard_step_timing', pageSlug, { step, step_name: stepName, duration_secs: Math.round(durationSecs) })
}

/**
 * Mark the current session as converted (lead form submitted).
 * Call immediately after a successful lead form submission.
 */
export function markConverted(leadId: string): void {
  const sessionId = getSessionId()
  if (!sessionId) return
  send({
    type: 'update',
    session_id: sessionId,
    converted: true,
    lead_id: leadId,
  })
}

/** Reset the session ID to start a fresh attempt of the wizard */
export function resetSessionId(pageSlug: string): string {
  if (typeof window === 'undefined') return ''
  const newSessionId = crypto.randomUUID()
  sessionStorage.setItem('crm_session_id', newSessionId)
  
  const utms = getUtmParams()
  send({
    type: 'visit',
    session_id: newSessionId,
    page_slug: pageSlug,
    referrer: document.referrer || null,
    ...utms,
  })
  
  return newSessionId
}
