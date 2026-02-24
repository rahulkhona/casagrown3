/**
 * AppHeader — Component Tests
 *
 * Tests: hamburger menu items navigate to correct routes.
 * Specifically verifies Profile routes to /profile (not /my-posts)
 * and Transfer Points is NOT present.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'

// ─── Mock dependencies ───────────────────────────────────────

const mockPush = jest.fn()
jest.mock('solito/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useParams: () => ({}),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockSignOut = jest.fn()
const mockSingle = jest.fn().mockResolvedValue({ data: { avatar_url: null }, error: null })
const mockEq = jest.fn().mockReturnValue({ single: mockSingle })
const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })

jest.mock('../auth/auth-hook', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: { access_token: 'mock-jwt' },
    signOut: mockSignOut,
    userDisplayName: 'Test User',
  }),
  supabase: {
    from: function() { return mockFrom.apply(null, arguments) },
  },
}))

jest.mock('../chat/chat-service', () => ({
  getUnreadChatCount: jest.fn().mockResolvedValue(0),
}))

jest.mock('../orders/order-service', () => ({
  getOpenOrderCount: jest.fn().mockResolvedValue(0),
}))

jest.mock('../offers/offer-service', () => ({
  getOpenOfferCount: jest.fn().mockResolvedValue(0),
}))

jest.mock('../../hooks/usePointsBalance', () => ({
  usePointsBalance: () => ({ balance: 100, loading: false }),
}))

jest.mock('../feed/FeedNavigation', () => {
  const { View } = require('react-native')
  return { FeedNavigation: () => <View testID="feed-nav" /> }
})

jest.mock('../points/PointsMenu', () => {
  const { View } = require('react-native')
  return { PointsMenu: () => <View testID="points-menu" /> }
})

jest.mock('../../utils/normalize-storage-url', () => ({
  normalizeStorageUrl: (url) => url,
}))

jest.mock('tamagui', () => {
  const React = require('react')
  const { View, Text: RNText, TouchableOpacity, ScrollView: RNScrollView } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    Button: ({ children, onPress, ...props }: any) => (
      <TouchableOpacity onPress={onPress} {...props}>{children}</TouchableOpacity>
    ),
    Separator: () => null,
    Spinner: () => <RNText>Loading...</RNText>,
    ScrollView: ({ children, ...props }: any) => <RNScrollView {...props}>{children}</RNScrollView>,
    // Simulate mobile viewport so hamburger renders
    useMedia: () => ({ sm: true, md: false, lg: false, xl: false, xxl: false }),
    isWeb: true,
  }
})

jest.mock('@tamagui/lucide-icons', () => {
  const { View } = require('react-native')
  const icon = (name: string) => (props: any) => <View testID={`icon-${name}`} />
  return {
    Home: icon('home'),
    MessageSquare: icon('message'),
    ShoppingCart: icon('shopping-cart'),
    Tag: icon('tag'),
    Menu: icon('menu'),
    X: icon('x'),
    User: icon('user'),
    HandCoins: icon('hand-coins'),
    History: icon('history'),
    PackageCheck: icon('package-check'),
    ShieldCheck: icon('shield-check'),
    Share2: icon('share2'),
    Users: icon('users'),
    LogOut: icon('log-out'),
    Bell: icon('bell'),
    ChevronDown: icon('chevron-down'),
    ChevronRight: icon('chevron-right'),
  }
})

jest.mock('../../design-tokens', () => ({
  colors: {
    green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534' },
    gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827' },
    red: { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626' },
    blue: { 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
  },
  borderRadius: { sm: 4, default: 4, md: 8, lg: 12, xl: 16, '2xl': 20 },
}))

// ─── Import after mocks ──────────────────────────────────────

import { AppHeader } from './AppHeader'

// Helper: open the hamburger menu by pressing the hamburger toggle button
async function openMenu(result: any) {
  // The hamburger toggle has aria-label="Menu"
  const menuToggle = result.getByLabelText('Menu')
  await act(async () => { fireEvent.press(menuToggle) })
}

// ─── Tests ───────────────────────────────────────────────────

describe('AppHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders and opens hamburger menu with Profile item', async () => {
    const result = render(<AppHeader activeKey="feed" />)
    await openMenu(result)
    expect(result.getByText('Profile & Settings')).toBeTruthy()
  })

  it('does NOT render Transfer Points menu item', async () => {
    const result = render(<AppHeader activeKey="feed" />)
    await openMenu(result)
    expect(result.queryByText('Transfer Points')).toBeNull()
  })

  it('Profile item navigates to /profile (not /my-posts)', async () => {
    const result = render(<AppHeader activeKey="feed" />)
    await openMenu(result)

    fireEvent.press(result.getByText('Profile & Settings'))
    expect(mockPush).toHaveBeenCalledWith('/profile')
    expect(mockPush).not.toHaveBeenCalledWith('/my-posts')
  })

  it('Delegate Sales navigates to /delegate', async () => {
    const result = render(<AppHeader activeKey="feed" />)
    await openMenu(result)

    fireEvent.press(result.getByText('Delegate Sales'))
    expect(mockPush).toHaveBeenCalledWith('/delegate')
  })

  it('Accept Delegation navigates to /accept-delegation', async () => {
    const result = render(<AppHeader activeKey="feed" />)
    await openMenu(result)

    fireEvent.press(result.getByText('Accept Delegation'))
    expect(mockPush).toHaveBeenCalledWith('/accept-delegation')
  })

  it('My Posts navigates to /my-posts', async () => {
    const result = render(<AppHeader activeKey="feed" />)
    await openMenu(result)

    fireEvent.press(result.getByText('My Posts'))
    expect(mockPush).toHaveBeenCalledWith('/my-posts')
  })

  it('Invite Friends navigates to /invite', async () => {
    const result = render(<AppHeader activeKey="feed" />)
    await openMenu(result)

    fireEvent.press(result.getByText('Invite Friends'))
    expect(mockPush).toHaveBeenCalledWith('/invite')
  })
})
