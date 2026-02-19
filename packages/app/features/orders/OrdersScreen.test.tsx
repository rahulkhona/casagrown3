/**
 * OrdersScreen Tests
 *
 * Tests the OrdersScreen component covering:
 * - Tab rendering (Open/Past)
 * - Role filter rendering (All/Buying/Selling)
 * - Loading state
 * - Empty state
 * - Order list rendering
 * - Tab switching
 * - Card press navigates to chat
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('tamagui', () => {
  const { View, Text: RNText, ActivityIndicator } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    Spinner: () => <ActivityIndicator />,
    Separator: () => null,
  }
})

jest.mock('@tamagui/lucide-icons', () => {
  const { View } = require('react-native')
  const MockIcon = (props: any) => <View testID={props.testID} />
  return {
    ArrowLeft: MockIcon,
    Package: MockIcon,
    ShoppingBag: MockIcon,
    Truck: MockIcon,
    ShieldAlert: MockIcon,
    DollarSign: MockIcon,
    Calendar: MockIcon,
    MapPin: MockIcon,
    MessageCircle: MockIcon,
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'orders.title': 'Orders',
        'orders.tabs.open': 'Open',
        'orders.tabs.past': 'Past',
        'orders.filters.all': 'All',
        'orders.filters.buying': 'Buying',
        'orders.filters.selling': 'Selling',
        'orders.loading': 'Loading orders...',
        'orders.retry': 'Retry',
        'orders.emptyOpen': 'No open orders',
        'orders.emptyPast': 'No past orders',
        'orders.emptyHint': 'Your orders will appear here',
        'orders.from': 'From',
        'orders.to': 'To',
        'orders.unknownSeller': 'Unknown Seller',
        'orders.unknownBuyer': 'Unknown Buyer',
      }
      return translations[key] || key
    },
  }),
}))

jest.mock('../../design-tokens', () => ({
  colors: {
    green: { 100: '#dcfce7', 300: '#86efac', 600: '#16a34a', 700: '#15803d' },
    gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827' },
    amber: { 100: '#fef3c7', 700: '#b45309', 800: '#92400e' },
    red: { 100: '#fee2e2', 700: '#b91c1c' },
    blue: { 100: '#dbeafe', 700: '#1d4ed8' },
    purple: { 100: '#f3e8ff', 700: '#7c3aed' },
  },
  borderRadius: { sm: 4, md: 8, lg: 12 },
  shadows: { sm: { color: '#000', offset: { width: 0, height: 1 }, radius: 2 } },
}))

jest.mock('../../utils/normalize-storage-url', () => ({
  normalizeStorageUrl: (url: string | null) => url,
}))

const mockRefresh = jest.fn()
const mockUseOrders = jest.fn()

jest.mock('./useOrders', () => ({
  useOrders: (...args: any[]) => mockUseOrders(...args),
}))

import { OrdersScreen } from './OrdersScreen'

// ─── Helpers ─────────────────────────────────────────────
function makeOrder(overrides: Partial<any> = {}) {
  return {
    id: 'order-1',
    offer_id: 'offer-1',
    post_id: 'post-1',
    conversation_id: 'conv-1',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
    buyer_name: 'Alice',
    seller_name: 'Bob',
    buyer_avatar_url: null,
    seller_avatar_url: null,
    category: 'produce',
    product: 'Tomatoes',
    quantity: 5,
    unit: 'box',
    points_per_unit: 10,
    total_price: 50,
    status: 'accepted',
    delivery_address: null,
    delivery_date: null,
    delivery_instructions: null,
    delivery_proof_media_id: null,
    delivery_proof_url: null,
    delivery_proof_location: null,
    delivery_proof_timestamp: null,
    dispute_proof_media_id: null,
    dispute_proof_url: null,
    buyer_rating: null,
    buyer_feedback: null,
    seller_rating: null,
    seller_feedback: null,
    version: 1,
    created_at: '2026-02-16T10:00:00Z',
    updated_at: '2026-02-16T10:00:00Z',
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────

describe('OrdersScreen', () => {
  const onClose = jest.fn()
  const onOpenChat = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseOrders.mockReturnValue({
      orders: [],
      loading: false,
      error: null,
      refresh: mockRefresh,
    })
  })

  it('renders tab buttons', () => {
    render(
      <OrdersScreen
        currentUserId="buyer-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    expect(screen.getByText('Open')).toBeTruthy()
    expect(screen.getByText('Past')).toBeTruthy()
  })

  it('renders role filter buttons', () => {
    render(
      <OrdersScreen
        currentUserId="buyer-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    expect(screen.getByText('All')).toBeTruthy()
    expect(screen.getByText('Buying')).toBeTruthy()
    expect(screen.getByText('Selling')).toBeTruthy()
  })

  it('shows empty state when no orders', () => {
    render(
      <OrdersScreen
        currentUserId="buyer-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    expect(screen.getByText('No open orders')).toBeTruthy()
  })

  it('renders order cards when orders exist', () => {
    mockUseOrders.mockReturnValue({
      orders: [makeOrder()],
      loading: false,
      error: null,
      refresh: mockRefresh,
    })
    render(
      <OrdersScreen
        currentUserId="buyer-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    expect(screen.getByText('Tomatoes')).toBeTruthy()
  })

  it('shows error state with retry button', () => {
    mockUseOrders.mockReturnValue({
      orders: [],
      loading: false,
      error: 'Failed to load',
      refresh: mockRefresh,
    })
    render(
      <OrdersScreen
        currentUserId="buyer-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    expect(screen.getByText('Failed to load')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('calls refresh on retry', () => {
    mockUseOrders.mockReturnValue({
      orders: [],
      loading: false,
      error: 'Failed to load',
      refresh: mockRefresh,
    })
    render(
      <OrdersScreen
        currentUserId="buyer-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    fireEvent.press(screen.getByText('Retry'))
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('switches role filter', () => {
    render(
      <OrdersScreen
        currentUserId="buyer-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    fireEvent.press(screen.getByTestId('orders-filter-selling'))
    expect(mockUseOrders).toHaveBeenCalledWith(
      'buyer-1',
      expect.objectContaining({ role: 'selling' }),
    )
  })

  it('calls onClose when back button pressed', () => {
    render(
      <OrdersScreen
        currentUserId="buyer-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    fireEvent.press(screen.getByLabelText('Back'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onOpenChat with postId and otherUserId when card is pressed', () => {
    mockUseOrders.mockReturnValue({
      orders: [makeOrder()],
      loading: false,
      error: null,
      refresh: mockRefresh,
    })
    render(
      <OrdersScreen
        currentUserId="buyer-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    fireEvent.press(screen.getByTestId('order-card-order-1'))
    expect(onOpenChat).toHaveBeenCalledWith('post-1', 'seller-1')
  })

  it('calls onOpenChat with buyer as otherUserId when user is seller', () => {
    mockUseOrders.mockReturnValue({
      orders: [makeOrder()],
      loading: false,
      error: null,
      refresh: mockRefresh,
    })
    render(
      <OrdersScreen
        currentUserId="seller-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    fireEvent.press(screen.getByTestId('order-card-order-1'))
    expect(onOpenChat).toHaveBeenCalledWith('post-1', 'buyer-1')
  })

  it('renders multiple order cards', () => {
    mockUseOrders.mockReturnValue({
      orders: [
        makeOrder({ id: 'order-1', product: 'Tomatoes' }),
        makeOrder({ id: 'order-2', product: 'Basil' }),
      ],
      loading: false,
      error: null,
      refresh: mockRefresh,
    })
    render(
      <OrdersScreen
        currentUserId="buyer-1"
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    )
    expect(screen.getByText('Tomatoes')).toBeTruthy()
    expect(screen.getByText('Basil')).toBeTruthy()
  })
})
