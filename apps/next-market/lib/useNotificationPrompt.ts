'use client'

/**
 * useNotificationPrompt — Web-only hook for the market app.
 *
 * Equivalent to the community app's useNotificationPrompt but uses
 * vanilla React (no react-native / Tamagui dependencies).
 *
 * Call showPrompt() at trigger points (Buy, Create Product, Chat).
 * Spread modalProps onto NotificationPromptModal.
 */

import { useCallback, useRef, useState } from 'react'
import { createClient } from './supabase'

// =============================================================================
// Types
// =============================================================================

export type PromptVariant = 'first-time' | 'denied' | 'ios-safari' | 'ios-chrome'

type NotifPlatform = 'desktop-web' | 'ios-safari-browser' | 'ios-chrome-browser' | 'ios-pwa' | 'android-web'

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

// =============================================================================
// Storage (localStorage-based, web only)
// =============================================================================

const DISMISSED_AT_KEY = 'casagrown_notif_dismissed_at'
const OPTED_OUT_KEY = 'casagrown_notif_opted_out'
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

export function detectPlatform(): NotifPlatform {
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

export function getPermissionStatus(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as PermissionState
}

export function getPromptVariant(): PromptVariant | 'none' {
  const platform = detectPlatform()
  const permission = getPermissionStatus()

  if (permission === 'granted') return 'none'
  if (platform === 'ios-safari-browser') return 'ios-safari'
  if (platform === 'ios-chrome-browser') return 'ios-chrome'
  if (permission === 'denied') return 'denied'
  return 'first-time'
}

/** Check if notifications are effectively enabled (granted or unsupported) */
export function isNotificationsEnabled(): boolean {
  // In the native Expo wrapper, the Web Notification API doesn't exist.
  // The wrapper manages push permissions independently — if we're native,
  // check the localStorage flag set by receiveNativeToken, default to true
  // (the user already granted the OS permission or the wrapper will prompt).
  if (typeof window !== 'undefined' && window.IS_NATIVE_APP) {
    return storageGet('casagrown_native_push_registered') === 'granted'
  }
  return getPermissionStatus() === 'granted'
}

/** Check if we're on an iOS browser (not PWA) — need PWA setup */
export function isIOSBrowser(): boolean {
  const p = detectPlatform()
  return p === 'ios-safari-browser' || p === 'ios-chrome-browser'
}

async function shouldShowPrompt(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false
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
// VAPID Key
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

// =============================================================================
// Push Subscription + Token Registration
// =============================================================================

async function enableWebPush(userId: string): Promise<boolean> {
  const { NativeBridge } = await import('./nativeBridge')
  if (NativeBridge.isNative) {
    console.log('[Notifications] Native mode detected, requesting push permissions...');
    return new Promise((resolve) => {
      window.receiveNativeToken = async (tokenStr: string) => {
        console.log('[Notifications] receiveNativeToken called:', tokenStr?.substring(0, 30));
        if (tokenStr === 'DENIED') {
          storageSet('casagrown_native_push_registered', 'denied');
          resolve(false);
          return;
        }
        try {
          const supabase = createClient();
          console.log('[Notifications] Registering expo token with backend...');
          const { data, error } = await supabase.functions.invoke('register-push-token', {
            body: { token: tokenStr, platform: 'expo', endpoint: null },
          });
          if (error) {
            console.error('[Notifications] register-push-token error:', error);
            resolve(false);
            return;
          }
          console.log('[Notifications] Token registered successfully:', data);
          storageSet('casagrown_native_push_registered', 'granted');
          resolve(true);
        } catch (err) {
          console.error('[Notifications] Expo Push registration failed:', err);
          resolve(false);
        }
      };
      NativeBridge.requestPushPermissions();
      console.log('[Notifications] requestPushPermissions sent to native');
    });
  }

  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription: PushSubscription | null = null

    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      })
    } catch (err: any) {
      if (err.name === 'InvalidStateError') {
        console.warn('[Notifications] VAPID key mismatch detected. Unsubscribing old subscription...')
        const oldSubscription = await registration.pushManager.getSubscription()
        if (oldSubscription) {
          await oldSubscription.unsubscribe()
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
        })
      } else {
        throw err
      }
    }

    if (!subscription) return false

    const supabase = createClient()
    await supabase.functions.invoke('register-push-token', {
      body: {
        token: JSON.stringify(subscription.toJSON()),
        platform: 'web',
        endpoint: subscription.endpoint,
      },
    })
    return true
  } catch (err) {
    console.error('[Notifications] Push subscription failed:', err)
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
  onOpenSettings?: () => void
}

export function useNotificationPrompt(userId?: string) {
  const [visible, setVisible] = useState(false)
  const [variant, setVariant] = useState<PromptVariant>('first-time')
  const checkingRef = useRef(false)

  const onEnable = useCallback(async () => {
    if (!userId) return
    setVisible(false)
    const success = await enableWebPush(userId)
    if (!success) {
      const { NativeBridge } = await import('./nativeBridge')
      if (NativeBridge.isNative) {
        setVariant('denied')
        setVisible(true)
      }
    }
  }, [userId])

  const onOpenSettings = useCallback(async () => {
    const { NativeBridge } = await import('./nativeBridge')
    if (NativeBridge.isNative) {
      NativeBridge.openAppSettings()
      setVisible(false)
    }
  }, [])

  const showPrompt = useCallback(async (force?: boolean) => {
    if (checkingRef.current) return
    checkingRef.current = true
    try {
      const { NativeBridge } = await import('./nativeBridge')
      if (NativeBridge.isNative) {
        // We do not silently re-register on native; the native wrapper handles persistence.
      } else {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          if (!promptedThisSession && userId) {
            promptedThisSession = true
            void enableWebPush(userId)
          }
          return
        }
      }

      if (!force) {
        const shouldShow = await shouldShowPrompt()
        if (!shouldShow) return
      }

      promptedThisSession = true
      
      let finalVariant = 'first-time' as PromptVariant
      if (!NativeBridge.isNative) {
        const pv = getPromptVariant()
        if (pv === 'none') return
        finalVariant = pv
      }

      setVariant(finalVariant)
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
    modalProps: { visible, variant, onEnable, onDismiss, onPermanentDismiss, onOpenSettings } as NotificationModalProps,
  }
}
