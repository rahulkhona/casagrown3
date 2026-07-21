/**
 * Pending Intent Utility
 * Handles storing, retrieving, and executing deferred actions (e.g. follow seller, accept booth helper)
 * pre- and post-authentication across web and mobile platforms.
 */

import { Platform } from 'react-native'

export type PendingIntentType = 'follow' | 'accept_booth'

export interface PendingIntent {
  type: PendingIntentType
  targetId?: string // User ID or username for follow
  code?: string     // Invite code for booth helper
  referrerId?: string
  sellerName?: string
  createdAt: number
}

const STORAGE_KEY = 'cg_pending_intent'

export function setPendingIntent(intent: Omit<PendingIntent, 'createdAt'>): void {
  const data: PendingIntent = {
    ...intent,
    createdAt: Date.now(),
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    }
  } catch (e) {
    console.warn('Failed to save pending intent:', e)
  }
}

export function getPendingIntent(): PendingIntent | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed: PendingIntent = JSON.parse(raw)
      // Expire intents older than 24 hours
      if (Date.now() - parsed.createdAt > 24 * 60 * 60 * 1000) {
        clearPendingIntent()
        return null
      }
      return parsed
    }
  } catch (e) {
    console.warn('Failed to read pending intent:', e)
  }
  return null
}

export function clearPendingIntent(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch (e) {
    console.warn('Failed to clear pending intent:', e)
  }
}
