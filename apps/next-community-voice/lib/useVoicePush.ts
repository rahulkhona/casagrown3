'use client'

/**
 * useVoicePush — Notification prompt hook for the Community Voice app.
 *
 * Identical logic to market's useNotificationPrompt, adapted for the voice
 * app's supabase client. Community users get a prompt modal (unlike admin
 * which is silent — community is public-facing and needs explicit consent UX).
 *
 * Call showPrompt() at trigger points (submitting feedback, adding a comment).
 * Spread modalProps onto NotificationPromptModal.
 */

import { useCallback, useRef, useState } from 'react'
import { supabase } from '@casagrown/app/utils/supabase'

// =============================================================================
// Types
// =============================================================================

export type PromptVariant = 'first-time' | 'denied' | 'ios-safari' | 'ios-chrome'

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

// =============================================================================
// Storage (localStorage-based, web only)
// =============================================================================

const DISMISSED_AT_KEY = 'casagrown_voice_notif_dismissed_at'
const OPTED_OUT_KEY = 'casagrown_voice_notif_opted_out'
const RE_PROMPT_DAYS = 7

let promptedThisSession = false

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch {}
}

// =============================================================================
// Platform Detection
// =============================================================================

type NotifPlatform = 'desktop-web' | 'ios-safari-browser' | 'ios-chrome-browser' | 'ios-pwa' | 'android-web'

function detectPlatform(): NotifPlatform {
  if (typeof navigator === 'undefined') return 'desktop-web'
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (isIOS) {
    const isStandalone =
      ('standalone' in navigator && (navigator as any).standalone) ||
      window.matchMedia('(display-mode: standalone)').matches
    if (isStandalone) return 'ios-pwa'
    return /CriOS/.test(ua) ? 'ios-chrome-browser' : 'ios-safari-browser'
  }
  if (/Android/.test(ua)) return 'android-web'
  return 'desktop-web'
}

function getPermissionStatus(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as PermissionState
}

function getPromptVariant(): PromptVariant | 'none' {
  const platform = detectPlatform()
  const permission = getPermissionStatus()
  if (permission === 'granted') return 'none'
  if (platform === 'ios-safari-browser') return 'ios-safari'
  if (platform === 'ios-chrome-browser') return 'ios-chrome'
  if (permission === 'denied') return 'denied'
  return 'first-time'
}

async function shouldShowPrompt(): Promise<boolean> {
  if (promptedThisSession) return false
  if (storageGet(OPTED_OUT_KEY) === 'true') return false
  const dismissedAt = storageGet(DISMISSED_AT_KEY)
  if (dismissedAt) {
    const daysSince = (Date.now() - new Date(dismissedAt).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < RE_PROMPT_DAYS) return false
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') return false
  return true
}

// =============================================================================
// VAPID Key + Push Subscription
// =============================================================================

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr
}

async function enableWebPush(userId: string): Promise<boolean> {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return false
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Voice Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set')
    return false
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    })

    const { error } = await supabase.functions.invoke('register-push-token', {
      body: {
        token: JSON.stringify(subscription.toJSON()),
        platform: 'web',
        endpoint: subscription.endpoint,
      },
    })

    if (error) throw error
    return true
  } catch (err) {
    console.error('[Voice Push] Push subscription failed:', err)
    return false
  }
}

// =============================================================================
// Hook
// =============================================================================

export interface NotificationModalProps {
  visible: boolean
  variant: PromptVariant
  onEnable: () => void
  onDismiss: () => void
  onPermanentDismiss: () => void
}

export function useVoicePush(userId?: string) {
  const [visible, setVisible] = useState(false)
  const [variant, setVariant] = useState<PromptVariant>('first-time')
  const checkingRef = useRef(false)

  const onEnable = useCallback(async () => {
    if (!userId) return
    setVisible(false)
    await enableWebPush(userId)
  }, [userId])

  const showPrompt = useCallback(async () => {
    if (checkingRef.current) return
    checkingRef.current = true
    try {
      // If permission already granted, silently re-register (handles VAPID rotation,
      // browser reinstall, device change) without ever showing a prompt again.
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        if (!promptedThisSession && userId) {
          promptedThisSession = true
          void enableWebPush(userId)
        }
        return
      }

      const shouldShow = await shouldShowPrompt()
      if (!shouldShow) return

      promptedThisSession = true
      setVariant(getPromptVariant() as PromptVariant)
      setVisible(true)
    } finally {
      checkingRef.current = false
    }
  }, [userId])

  const onDismiss = useCallback(() => {
    setVisible(false)
    promptedThisSession = true
    storageSet(DISMISSED_AT_KEY, new Date().toISOString())
  }, [])

  const onPermanentDismiss = useCallback(() => {
    setVisible(false)
    promptedThisSession = true
    storageSet(OPTED_OUT_KEY, 'true')
  }, [])

  return {
    showPrompt,
    modalProps: { visible, variant, onEnable, onDismiss, onPermanentDismiss } as NotificationModalProps,
  }
}
