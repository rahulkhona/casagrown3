'use client'

/**
 * useAdminPush — Silent push subscription for admin staff.
 *
 * No modal, no prompts. When an authenticated admin visits any dashboard page:
 *   1. Checks if browser supports push notifications
 *   2. If Notification.permission is 'default' → requests permission silently
 *   3. Subscribes to Web Push with the VAPID public key
 *   4. Registers the subscription with the backend via register-push-token
 *
 * Admin users need push for:
 *   - Settlement funds_received alerts
 *   - Dispute escalations
 *   - Moderation flags
 */

import { useEffect, useRef } from 'react'
import { createClient } from '@casagrown/app/features/auth/supabase-client'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function useAdminPush(userId: string | undefined) {
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (!userId || subscribedRef.current) return
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return
    if (!VAPID_PUBLIC_KEY) {
      console.warn('[Admin Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set')
      return
    }

    subscribedRef.current = true

    const subscribe = async () => {
      try {
        // Request permission if not already decided
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') return
        }
        if (Notification.permission !== 'granted') return

        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })

        // Register with backend
        const supabase = createClient()
        const payload = subscription.toJSON()
        await supabase.functions.invoke('register-push-token', {
          body: {
            endpoint: payload.endpoint,
            keys: payload.keys,
            platform: 'web',
          },
        })

        console.log('[Admin Push] Subscribed successfully')
      } catch (err) {
        console.warn('[Admin Push] Subscription failed:', err)
      }
    }

    void subscribe()
  }, [userId])
}
