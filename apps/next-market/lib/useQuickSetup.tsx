'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useAuth } from './useAuth'
import QuickSetupModal from '../app/components/QuickSetupModal'

interface RequireAuthOptions {
  trigger?: string          // Analytics context: 'buy_now', 'add_to_cart', 'checkout', 'community_post'
  onReady?: () => void      // Called when user is authenticated + profile complete + TOS accepted
  onCancel?: () => void     // Called when user cancels/closes modal
  defaultSignIn?: boolean   // If true, QuickSetup opens with Sign In tab selected
  addressNote?: string      // Custom note explaining why address is needed
  prefill?: {               // Pre-fill QuickSetup fields (e.g. from URL params)
    name?: string
    email?: string
    zip?: string
    phone?: string
    street?: string
    city?: string
    state?: string
  }
}

interface QuickSetupContextValue {
  /** Gate function: if user is fully set up, runs onReady immediately; otherwise opens the QuickSetupModal */
  requireAuth: (options?: RequireAuthOptions) => void
}

const QuickSetupContext = createContext<QuickSetupContextValue | null>(null)

/**
 * Global provider that renders a single QuickSetupModal at the layout level.
 * Any component in the tree can call `useQuickSetup().requireAuth()`.
 */
export function QuickSetupProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, profileComplete, tosAccepted } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<RequireAuthOptions | null>(null)

  const requireAuth = useCallback(
    (options?: RequireAuthOptions) => {
      const opts = options || {}
      // If user is fully set up, execute immediately
      if (isAuthenticated && profileComplete && tosAccepted) {
        opts.onReady?.()
        return
      }

      // Otherwise, open the modal and queue the action
      setPendingAction(opts)
      setIsOpen(true)
    },
    [isAuthenticated, profileComplete, tosAccepted],
  )

  const handleComplete = useCallback(() => {
    setIsOpen(false)
    // Execute the queued action after modal completion
    if (pendingAction) {
      // Small delay to let auth state propagate
      setTimeout(() => {
        pendingAction.onReady?.()
        setPendingAction(null)
      }, 300)
    }
  }, [pendingAction])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    if (pendingAction?.onCancel) {
      pendingAction.onCancel()
    }
    setPendingAction(null)
  }, [pendingAction])

  return (
    <QuickSetupContext.Provider value={{ requireAuth }}>
      {children}
      <QuickSetupModal
        isOpen={isOpen}
        onClose={handleClose}
        onComplete={handleComplete}
        trigger={pendingAction?.trigger}
        prefill={pendingAction?.prefill}
        defaultSignIn={pendingAction?.defaultSignIn}
        addressNote={pendingAction?.addressNote}
      />
    </QuickSetupContext.Provider>
  )
}

/**
 * Hook to access the global QuickSetup auth gate.
 *
 * Usage:
 * ```tsx
 * const { requireAuth } = useQuickSetup()
 *
 * const handleBuyNow = () => {
 *   requireAuth({
 *     trigger: 'buy_now',
 *     onReady: () => setShowBuy(true)
 *   })
 * }
 * ```
 */
export function useQuickSetup() {
  const ctx = useContext(QuickSetupContext)
  if (!ctx) {
    throw new Error('useQuickSetup must be used within a QuickSetupProvider')
  }
  return ctx
}
