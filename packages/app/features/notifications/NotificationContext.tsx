'use client'

import React, { createContext, useContext } from 'react'
import { useNotifications, type Notification } from './useNotifications'
import { useAuth } from '../auth/auth-hook'

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  clearAll: () => Promise<void>
  refetch: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

/**
 * NotificationProvider — wraps `useNotifications` in a single shared context.
 *
 * This ensures AppHeader, NotificationPanel, and MobileTabHeader all share the
 * same state. When the panel calls markAllAsRead(), the badge in the header
 * updates immediately.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const notifs = useNotifications(user?.id)

  return (
    <NotificationContext.Provider value={notifs}>
      {children}
    </NotificationContext.Provider>
  )
}

/**
 * useNotificationContext — access the shared notification state.
 * Must be used under a <NotificationProvider>.
 */
export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext)
  if (!ctx) {
    // Fallback for components rendered outside the provider (e.g. tests)
    return {
      notifications: [],
      unreadCount: 0,
      loading: false,
      markAsRead: async () => {},
      markAllAsRead: async () => {},
      clearAll: async () => {},
      refetch: async () => {},
    }
  }
  return ctx
}
