// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Unmock so we test the real implementation (setup.ts mocks it for rendering tests)
vi.unmock('../../lib/useNotificationPrompt')
import {
  detectPlatform,
  getPermissionStatus,
  isNotificationsEnabled,
  isIOSBrowser,
  getPromptVariant,
} from '../../lib/useNotificationPrompt'

describe('useNotificationPrompt - platform detection', () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true })
  })

  it('returns desktop-web when navigator is undefined', () => {
    const orig = globalThis.navigator
    // @ts-ignore
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true })
    expect(detectPlatform()).toBe('desktop-web')
    Object.defineProperty(globalThis, 'navigator', { value: orig, configurable: true })
  })

  it('detects desktop-web on standard browser', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 },
      configurable: true,
    })
    expect(detectPlatform()).toBe('desktop-web')
  })

  it('detects android-web', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6)', platform: 'Linux', maxTouchPoints: 5 },
      configurable: true,
    })
    expect(detectPlatform()).toBe('android-web')
  })
})

describe('useNotificationPrompt - permission status', () => {
  it('returns unsupported when Notification is undefined', () => {
    const orig = globalThis.Notification
    // @ts-ignore
    delete globalThis.Notification
    expect(getPermissionStatus()).toBe('unsupported')
    // @ts-ignore
    if (orig) globalThis.Notification = orig
  })

  it('returns granted when permission is granted', () => {
    // @ts-ignore
    globalThis.Notification = { permission: 'granted' }
    expect(getPermissionStatus()).toBe('granted')
  })

  it('returns denied when permission is denied', () => {
    // @ts-ignore
    globalThis.Notification = { permission: 'denied' }
    expect(getPermissionStatus()).toBe('denied')
  })

  it('returns default for default permission', () => {
    // @ts-ignore
    globalThis.Notification = { permission: 'default' }
    expect(getPermissionStatus()).toBe('default')
  })
})

describe('useNotificationPrompt - isNotificationsEnabled', () => {
  it('returns true when granted', () => {
    // @ts-ignore
    globalThis.Notification = { permission: 'granted' }
    expect(isNotificationsEnabled()).toBe(true)
  })

  it('returns false when not granted', () => {
    // @ts-ignore
    globalThis.Notification = { permission: 'default' }
    expect(isNotificationsEnabled()).toBe(false)
  })
})

describe('useNotificationPrompt - isIOSBrowser', () => {
  it('returns false on desktop', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 },
      configurable: true,
    })
    expect(isIOSBrowser()).toBe(false)
  })
})

describe('useNotificationPrompt - getPromptVariant', () => {
  it('returns none when already granted', () => {
    // @ts-ignore
    globalThis.Notification = { permission: 'granted' }
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 },
      configurable: true,
    })
    expect(getPromptVariant()).toBe('none')
  })

  it('returns denied when permission is denied', () => {
    // @ts-ignore
    globalThis.Notification = { permission: 'denied' }
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 },
      configurable: true,
    })
    expect(getPromptVariant()).toBe('denied')
  })

  it('returns first-time when permission is default', () => {
    // @ts-ignore
    globalThis.Notification = { permission: 'default' }
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 },
      configurable: true,
    })
    expect(getPromptVariant()).toBe('first-time')
  })
})
