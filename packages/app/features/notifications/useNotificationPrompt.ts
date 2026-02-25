/**
 * useNotificationPrompt - Hook to integrate notification prompts at trigger points.
 * Call showPrompt() at trigger points (Buy, Offer, Chat, Post).
 * Spread modalProps onto the NotificationPromptModal component.
 */

import { useState, useCallback, useRef } from 'react'
import {
  shouldShowPrompt,
  setDismissed,
  setPermanentOptOut,
  setPromptedThisSession,
} from './notification-storage'
import {
  getPromptVariant,
  enableWebPush,
  enableIOSPush,
  enableAndroidPush,
  detectPlatform,
  type NotifPlatform,
} from './notification-service'
import type { PromptVariant } from './NotificationPromptModal'
import { Platform } from 'react-native'

interface UseNotificationPromptReturn {
  /** Call at trigger points (Buy, Offer, Chat, Create Post) */
  showPrompt: () => void
  /** Spread onto NotificationPromptModal */
  modalProps: {
    visible: boolean
    variant: PromptVariant
    onEnable: () => void
    onDismiss: () => void
    onPermanentDismiss: () => void
  }
}

export function useNotificationPrompt(userId?: string): UseNotificationPromptReturn {
  const [visible, setVisible] = useState(false)
  const [variant, setVariant] = useState<PromptVariant>('first-time')
  const checkingRef = useRef(false)

  const showPrompt = useCallback(async () => {
    // Prevent concurrent checks
    if (checkingRef.current) return
    checkingRef.current = true

    try {
      const shouldShow = await shouldShowPrompt()
      if (!shouldShow) return

      const promptVariant = getPromptVariant()
      if (promptVariant === 'none') return

      // Mark as prompted this session (prevent re-showing)
      setPromptedThisSession()

      setVariant(promptVariant)
      setVisible(true)
    } finally {
      checkingRef.current = false
    }
  }, [])

  const onEnable = useCallback(async () => {
    if (!userId) return

    const platform = detectPlatform()

    let success = false
    if (platform === 'native-ios') {
      success = await enableIOSPush(userId)
    } else if (platform === 'native-android') {
      success = await enableAndroidPush(userId)
    } else {
      // Web (desktop, PWA, android-web)
      success = await enableWebPush(userId)
    }

    setVisible(false)

    if (!success) {
      console.warn('[useNotificationPrompt] Permission was not granted')
    }
  }, [userId])

  const onDismiss = useCallback(async () => {
    setVisible(false)
    await setDismissed()
  }, [])

  const onPermanentDismiss = useCallback(async () => {
    setVisible(false)
    await setPermanentOptOut()
  }, [])

  return {
    showPrompt,
    modalProps: {
      visible,
      variant,
      onEnable,
      onDismiss,
      onPermanentDismiss,
    },
  }
}
