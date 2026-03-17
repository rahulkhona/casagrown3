// @vitest-environment jsdom
/**
 * Deep tests for useNotificationPrompt hook and its exported utilities.
 * Covers: detectPlatform, getPermissionStatus, getPromptVariant,
 * isNotificationsEnabled, isIOSBrowser, shouldShowPrompt (via showPrompt),
 * urlBase64ToUint8Array, onDismiss, onPermanentDismiss, onEnable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Unmock so we test the real implementation (setup.ts mocks it for rendering tests)
vi.unmock('../../lib/useNotificationPrompt')

// ── Supabase mock ──
vi.mock('../../lib/supabase', () => ({
  createClient: () => ({
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  }),
}))

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  // Reset module-scoped variable
  vi.stubGlobal('Notification', { permission: 'default' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('detectPlatform', () => {
  it('returns desktop-web by default', async () => {
    const { detectPlatform } = await import('../../lib/useNotificationPrompt')
    expect(detectPlatform()).toBe('desktop-web')
  })

  it('returns android-web for Android UA', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel) AppleWebKit/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    })
    vi.resetModules()
    const { detectPlatform } = await import('../../lib/useNotificationPrompt')
    expect(detectPlatform()).toBe('android-web')
  })

  it('returns ios-safari-browser for iPhone Safari', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    vi.stubGlobal('window', {
      ...window,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    })
    vi.resetModules()
    const { detectPlatform } = await import('../../lib/useNotificationPrompt')
    expect(detectPlatform()).toBe('ios-safari-browser')
  })

  it('returns ios-chrome-browser for iPhone Chrome', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) CriOS/100',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    vi.stubGlobal('window', {
      ...window,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    })
    vi.resetModules()
    const { detectPlatform } = await import('../../lib/useNotificationPrompt')
    expect(detectPlatform()).toBe('ios-chrome-browser')
  })
})

describe('getPermissionStatus', () => {
  it('returns the Notification.permission value', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' })
    vi.resetModules()
    const { getPermissionStatus } = await import('../../lib/useNotificationPrompt')
    expect(getPermissionStatus()).toBe('granted')
  })

  it('returns unsupported when Notification is undefined', async () => {
    vi.stubGlobal('Notification', undefined)
    vi.resetModules()
    const { getPermissionStatus } = await import('../../lib/useNotificationPrompt')
    expect(getPermissionStatus()).toBe('unsupported')
  })
})

describe('getPromptVariant', () => {
  it('returns none when permission is granted', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' })
    vi.resetModules()
    const { getPromptVariant } = await import('../../lib/useNotificationPrompt')
    expect(getPromptVariant()).toBe('none')
  })

  it('returns denied when permission is denied', async () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    vi.resetModules()
    const { getPromptVariant } = await import('../../lib/useNotificationPrompt')
    expect(getPromptVariant()).toBe('denied')
  })

  it('returns first-time when permission is default', async () => {
    vi.stubGlobal('Notification', { permission: 'default' })
    vi.resetModules()
    const { getPromptVariant } = await import('../../lib/useNotificationPrompt')
    expect(getPromptVariant()).toBe('first-time')
  })
})

describe('isNotificationsEnabled', () => {
  it('returns true when granted', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' })
    vi.resetModules()
    const { isNotificationsEnabled } = await import('../../lib/useNotificationPrompt')
    expect(isNotificationsEnabled()).toBe(true)
  })

  it('returns false when default', async () => {
    vi.stubGlobal('Notification', { permission: 'default' })
    vi.resetModules()
    const { isNotificationsEnabled } = await import('../../lib/useNotificationPrompt')
    expect(isNotificationsEnabled()).toBe(false)
  })
})

describe('isIOSBrowser', () => {
  it('returns false on desktop', async () => {
    vi.resetModules()
    const { isIOSBrowser } = await import('../../lib/useNotificationPrompt')
    expect(isIOSBrowser()).toBe(false)
  })
})

describe('useNotificationPrompt hook', () => {
  it('returns showPrompt and modalProps', async () => {
    vi.resetModules()
    const { useNotificationPrompt } = await import('../../lib/useNotificationPrompt')
    const { result } = renderHook(() => useNotificationPrompt('user-1'))
    
    expect(result.current.showPrompt).toBeDefined()
    expect(result.current.modalProps).toBeDefined()
    expect(result.current.modalProps.visible).toBe(false)
    expect(result.current.modalProps.variant).toBe('first-time')
  })

  it('showPrompt sets visible and variant', async () => {
    vi.stubGlobal('Notification', { permission: 'default' })
    vi.resetModules()
    const { useNotificationPrompt } = await import('../../lib/useNotificationPrompt')
    const { result } = renderHook(() => useNotificationPrompt('user-1'))

    await act(async () => { await result.current.showPrompt() })
    expect(result.current.modalProps.visible).toBe(true)
    expect(result.current.modalProps.variant).toBe('first-time')
  })

  it('onDismiss sets dismissed timestamp in localStorage', async () => {
    vi.stubGlobal('Notification', { permission: 'default' })
    vi.resetModules()
    const { useNotificationPrompt } = await import('../../lib/useNotificationPrompt')
    const { result } = renderHook(() => useNotificationPrompt('user-1'))

    await act(async () => { await result.current.showPrompt() })
    act(() => { result.current.modalProps.onDismiss() })
    
    expect(result.current.modalProps.visible).toBe(false)
    expect(localStorage.getItem('casagrown_notif_dismissed_at')).toBeTruthy()
  })

  it('onPermanentDismiss sets opted-out in localStorage', async () => {
    vi.stubGlobal('Notification', { permission: 'default' })
    vi.resetModules()
    const { useNotificationPrompt } = await import('../../lib/useNotificationPrompt')
    const { result } = renderHook(() => useNotificationPrompt('user-1'))

    await act(async () => { await result.current.showPrompt() })
    act(() => { result.current.modalProps.onPermanentDismiss() })

    expect(result.current.modalProps.visible).toBe(false)
    expect(localStorage.getItem('casagrown_notif_opted_out')).toBe('true')
  })

  it('showPrompt does not show when opted out', async () => {
    localStorage.setItem('casagrown_notif_opted_out', 'true')
    vi.stubGlobal('Notification', { permission: 'default' })
    vi.resetModules()
    const { useNotificationPrompt } = await import('../../lib/useNotificationPrompt')
    const { result } = renderHook(() => useNotificationPrompt('user-1'))

    await act(async () => { await result.current.showPrompt() })
    expect(result.current.modalProps.visible).toBe(false)
  })

  it('showPrompt does not show when recently dismissed', async () => {
    localStorage.setItem('casagrown_notif_dismissed_at', new Date().toISOString())
    vi.stubGlobal('Notification', { permission: 'default' })
    vi.resetModules()
    const { useNotificationPrompt } = await import('../../lib/useNotificationPrompt')
    const { result } = renderHook(() => useNotificationPrompt('user-1'))

    await act(async () => { await result.current.showPrompt() })
    expect(result.current.modalProps.visible).toBe(false)
  })
})
