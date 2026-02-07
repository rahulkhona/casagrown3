/**
 * LoginScreen Unit Tests
 * 
 * Tests: Basic rendering, referral code storage from prop (web localStorage),
 * and clipboard-based referral code bridge for native platforms.
 */

import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { LoginScreen } from './login-screen'

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en',
      changeLanguage: jest.fn(),
    },
  }),
}))

// Mock expo-clipboard (used by login-screen's clipboard bridge on native)
jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn().mockResolvedValue(''),
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}), { virtual: true })

// Mock expo-application (used for Google Play Install Referrer on Android)
const mockGetInstallReferrerAsync = jest.fn().mockResolvedValue(null)
jest.mock('expo-application', () => ({
  getInstallReferrerAsync: (...args: any[]) => mockGetInstallReferrerAsync(...args),
}), { virtual: true })

// Mock AsyncStorage (used by storeReferralCode on non-web platforms)
const mockAsyncSetItem = jest.fn().mockResolvedValue(undefined)
const mockAsyncGetItem = jest.fn().mockResolvedValue(null)
const mockAsyncRemoveItem = jest.fn().mockResolvedValue(undefined)
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: (...args: any[]) => mockAsyncSetItem(...args),
    getItem: (...args: any[]) => mockAsyncGetItem(...args),
    removeItem: (...args: any[]) => mockAsyncRemoveItem(...args),
  },
}))

// Mock Safe Area
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock Tamagui icons
jest.mock('@tamagui/lucide-icons', () => ({
  ArrowLeft: () => null,
  Mail: () => null,
  Chrome: () => null,
  Facebook: () => null,
}))

// Mock image asset requires
jest.mock('react-native', () => {
    const RN = jest.requireActual('react-native');
    RN.Image.resolveAssetSource = jest.fn((source) => source);
    return RN;
});

// Mock Solito Router
jest.mock('solito/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}))

// Mock useAuth HOOK
const mockSignInWithOtp = jest.fn()
const mockVerifyOtp = jest.fn()
const mockSignInWithOAuth = jest.fn()

jest.mock('./auth-hook', () => ({
  useAuth: () => ({
    signInWithOtp: mockSignInWithOtp,
    verifyOtp: mockVerifyOtp,
    signInWithOAuth: mockSignInWithOAuth,
    user: null,
    loading: false,
  }),
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null }),
        }),
      }),
    }),
  },
}))


// Mock Tamagui components
jest.mock('tamagui', () => {
  const { View, Text, TouchableOpacity, TextInput } = require('react-native')
  return {
    Button: ({ children, onPress, ...props }: any) => (
      <TouchableOpacity onPress={onPress} {...props}>{children}</TouchableOpacity>
    ),
    Input: (props: any) => <TextInput {...props} />,
    Text: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    ScrollView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Separator: () => <View />,
    useMedia: () => ({ sm: false, md: true, lg: false }),
    Spinner: () => <View />,
  }
})

// Setup localStorage mock 
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
}

// Assign on global — works in jest/jsdom without defineProperty
;(global as any).localStorage = localStorageMock
;(global as any).window = global as any

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.getItem.mockReset()
    localStorageMock.setItem.mockReset()
    localStorageMock.removeItem.mockReset()
    mockGetInstallReferrerAsync.mockResolvedValue(null)
  })

  it('renders correctly (initial state)', () => {
    const tree = render(<LoginScreen />).toJSON()
    expect(tree).toMatchSnapshot()
  })

  // =========================================
  // Referral Code Storage Tests
  // =========================================

  describe('Referral Code Storage (Web)', () => {
    const originalPlatform = Platform.OS

    beforeEach(() => {
      // Force web platform for localStorage tests
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true })
    })

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true })
    })

    it('stores referral code in localStorage when passed as prop', async () => {
      render(<LoginScreen referralCode="abc12345" />)
      
      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'casagrown_referral_code',
          'abc12345'
        )
      })
    })

    it('does NOT store referral code when prop is undefined', async () => {
      render(<LoginScreen />)
      
      // Wait for effects to run, then verify no referral code stored
      await waitFor(() => {
        expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
          'casagrown_referral_code',
          expect.anything()
        )
      }, { timeout: 500 })
    })

    it('stores referral code from URL query parameter (via prop)', async () => {
      // This simulates the LoginPage passing ?ref=CODE as referralCode prop
      render(<LoginScreen referralCode="wrny6ezu" />)
      
      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'casagrown_referral_code',
          'wrny6ezu'
        )
      })
    })
  })

  // =========================================
  // Install Referrer Tests (Android)
  // =========================================

  describe('Install Referrer (Android)', () => {
    const originalPlatform = Platform.OS

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'android', writable: true })
    })

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true })
    })

    it('reads referral code from Google Play Install Referrer', async () => {
      mockGetInstallReferrerAsync.mockResolvedValue('ref=abc12345')

      render(<LoginScreen />)

      await waitFor(() => {
        expect(mockGetInstallReferrerAsync).toHaveBeenCalled()
      })

      // Should store the referral code from Install Referrer via AsyncStorage
      await waitFor(() => {
        expect(mockAsyncSetItem).toHaveBeenCalledWith(
          'casagrown_referral_code',
          'abc12345'
        )
      })
    })

    it('falls back to clipboard when Install Referrer has no referral code', async () => {
      mockGetInstallReferrerAsync.mockResolvedValue('utm_source=google')

      const ExpoClipboard = require('expo-clipboard')
      ExpoClipboard.getStringAsync.mockResolvedValue('xy9kq2ab')

      render(<LoginScreen />)

      // Install Referrer was checked but had no ref= param
      await waitFor(() => {
        expect(mockGetInstallReferrerAsync).toHaveBeenCalled()
      })

      // Should fall back to clipboard
      await waitFor(() => {
        expect(ExpoClipboard.getStringAsync).toHaveBeenCalled()
      })
    })

    it('skips Install Referrer on iOS and goes straight to clipboard', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true })

      const ExpoClipboard = require('expo-clipboard')
      ExpoClipboard.getStringAsync.mockResolvedValue('')

      render(<LoginScreen />)

      // Install Referrer should NOT be called on iOS
      expect(mockGetInstallReferrerAsync).not.toHaveBeenCalled()

      // Clipboard should be checked instead
      await waitFor(() => {
        expect(ExpoClipboard.getStringAsync).toHaveBeenCalled()
      })
    })
  })

  // =========================================
  // Clipboard Bridge Tests (Native)
  // =========================================

  describe('Clipboard Bridge (Native)', () => {
    const originalPlatform = Platform.OS

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true })
    })

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true })
    })

    it('does NOT check clipboard on web platform', async () => {
      // Switch to web
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true })
      
      // Mock expo-clipboard
      jest.mock('expo-clipboard', () => ({
        getStringAsync: jest.fn(),
        setStringAsync: jest.fn(),
      }), { virtual: true })

      render(<LoginScreen />)

      // On web, clipboard should not be accessed at all
      // The function exits early with `if (Platform.OS === 'web') return`
      const ExpoClipboard = require('expo-clipboard')
      expect(ExpoClipboard.getStringAsync).not.toHaveBeenCalled()
    })
  })
})
