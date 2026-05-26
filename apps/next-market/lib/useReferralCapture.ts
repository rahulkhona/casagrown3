'use client'

/**
 * Referral & UTM Attribution Capture
 *
 * Captures referral and UTM parameters from the URL on every page load.
 * Stores first-touch, last-touch, and full touch history in localStorage.
 * Data is consumed at signup time and passed to Supabase auth metadata.
 *
 * URL Params:
 *   ?ref=<userId>         — user who shared the link
 *   ?utm_source=<source>  — ad platform (facebook, google, etc.)
 *   ?utm_medium=<medium>  — ad medium (cpc, social, email)
 *   ?utm_campaign=<name>  — campaign name
 */

import { useEffect } from 'react'

const STORAGE_KEY = 'casagrown_referral'

interface TouchPoint {
  source: string
  referrer_id: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  landed_at: string
  landing_url: string
}

interface ReferralState {
  first_touch: TouchPoint | null
  last_touch: TouchPoint | null
  touch_history: TouchPoint[]
}

/**
 * Detects the source from URL params and document.referrer
 */
function detectSource(params: URLSearchParams): {
  source: string
  referrer_id: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
} {
  const ref = params.get('ref')
  const utmSource = params.get('utm_source')
  const utmMedium = params.get('utm_medium')
  const utmCampaign = params.get('utm_campaign')

  // If ?ref= is present, this is a user invite
  if (ref) {
    return {
      source: 'invite',
      referrer_id: ref,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
    }
  }

  // If UTM source is present, use it directly
  if (utmSource) {
    return {
      source: utmSource,
      referrer_id: null,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
    }
  }

  // Detect from document.referrer
  if (typeof document !== 'undefined' && document.referrer) {
    const referrer = document.referrer.toLowerCase()
    if (referrer.includes('facebook.com') || referrer.includes('fb.com')) {
      return { source: 'facebook', referrer_id: null, utm_source: null, utm_medium: 'social', utm_campaign: null }
    }
    if (referrer.includes('nextdoor.com')) {
      return { source: 'nextdoor', referrer_id: null, utm_source: null, utm_medium: 'social', utm_campaign: null }
    }
    if (referrer.includes('instagram.com')) {
      return { source: 'instagram', referrer_id: null, utm_source: null, utm_medium: 'social', utm_campaign: null }
    }
    if (referrer.includes('twitter.com') || referrer.includes('x.com')) {
      return { source: 'twitter', referrer_id: null, utm_source: null, utm_medium: 'social', utm_campaign: null }
    }
    if (referrer.includes('google.com')) {
      return { source: 'google_organic', referrer_id: null, utm_source: null, utm_medium: 'organic', utm_campaign: null }
    }
    if (referrer.includes('bing.com')) {
      return { source: 'bing_organic', referrer_id: null, utm_source: null, utm_medium: 'organic', utm_campaign: null }
    }
  }

  // No identifiable source
  return { source: 'organic', referrer_id: null, utm_source: null, utm_medium: null, utm_campaign: null }
}

function getStoredState(): ReferralState {
  if (typeof window === 'undefined') return { first_touch: null, last_touch: null, touch_history: [] }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return { first_touch: null, last_touch: null, touch_history: [] }
}

function saveState(state: ReferralState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

/**
 * Hook: captures referral/UTM params on every page load.
 * Should be mounted once in the root layout.
 */
export function useReferralCapture() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)

    // Capture Facebook Messenger parameters if present
    const fbPsid = params.get('fb_psid')
    const fbPageId = params.get('fb_page_id')
    const fbChannel = params.get('fb_channel')

    if (fbPsid) {
      sessionStorage.setItem('fb_psid', fbPsid)
    }
    if (fbPageId) {
      sessionStorage.setItem('fb_page_id', fbPageId)
    }
    if (fbChannel) {
      sessionStorage.setItem('fb_channel', fbChannel)
    }

    const hasRef = params.has('ref')
    const hasUtm = params.has('utm_source')
    const hasReferrer = document.referrer && !document.referrer.includes(window.location.hostname)

    // Only capture if there's attribution signal
    if (!hasRef && !hasUtm && !hasReferrer) return

    const detection = detectSource(params)
    const touchPoint: TouchPoint = {
      source: detection.source,
      referrer_id: detection.referrer_id,
      utm_source: detection.utm_source,
      utm_medium: detection.utm_medium,
      utm_campaign: detection.utm_campaign,
      landed_at: new Date().toISOString(),
      landing_url: window.location.pathname + window.location.search,
    }

    const state = getStoredState()

    // First touch: only set once, never overwritten
    if (!state.first_touch) {
      state.first_touch = touchPoint
    }

    // Last touch: always overwritten with the latest attribution signal
    state.last_touch = touchPoint

    // Full history: append (cap at 50 to prevent localStorage bloat)
    state.touch_history.push(touchPoint)
    if (state.touch_history.length > 50) {
      state.touch_history = state.touch_history.slice(-50)
    }

    saveState(state)
  }, [])
}

/**
 * Returns the referral data to pass to supabase.auth.signInWithOtp() options.data
 * Called at signup time.
 */
export function getReferralData(): Record<string, string | null> {
  const state = getStoredState()

  // Last touch = signup attribution (what converted them)
  const lastTouch = state.last_touch || state.first_touch

  // First touch = discovery attribution (how they found us)
  const firstTouch = state.first_touch || state.last_touch

  return {
    signup_source: lastTouch?.source || 'organic',
    signup_referrer_id: lastTouch?.referrer_id || null,
    first_touch_source: firstTouch?.source || 'organic',
    first_touch_referrer_id: firstTouch?.referrer_id || null,
    utm_source: lastTouch?.utm_source || null,
    utm_medium: lastTouch?.utm_medium || null,
    utm_campaign: lastTouch?.utm_campaign || null,
  }
}

/**
 * Returns the full touch history for insertion into referral_touches table.
 * Called after signup succeeds.
 */
export function getTouchHistory(): TouchPoint[] {
  const state = getStoredState()
  return state.touch_history
}

/**
 * Clears referral data from localStorage after it's been consumed.
 * Called after touch history has been inserted into the database.
 */
export function clearReferralData() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
