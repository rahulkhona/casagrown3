/**
 * OrderCard Tests
 *
 * Tests the simplified OrderCard component covering:
 * - Rendering product name, status badge, other party, delivery details
 * - Card press behavior (entire card is clickable)
 * - Delivery proof display
 * - Escalated notice
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('tamagui', () => {
  const { View, Text: RNText } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
  }
})

jest.mock('@tamagui/lucide-icons', () => {
  const { View } = require('react-native')
  const MockIcon = (props: any) => <View testID={props.testID} />
  return {
    Truck: MockIcon,
    ShieldAlert: MockIcon,
    DollarSign: MockIcon,
    Calendar: MockIcon,
    MapPin: MockIcon,
    MessageCircle: MockIcon,
  }
})

jest.mock('../../design-tokens', () => ({
  colors: {
    green: { 100: '#dcfce7', 300: '#86efac', 600: '#16a34a', 700: '#15803d' },
    gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827' },
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

import { OrderCard } from './OrderCard'
import type { Order, OrderStatus } from './order-types'

// ─── Helpers ─────────────────────────────────────────────
const t = (key: string) => key

function makeOrder(overrides: Partial<Order> = {}): Order {
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
    status: 'accepted' as OrderStatus,
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

const defaultProps = {
  onPress: jest.fn(),
  t,
}

// ─── Tests ───────────────────────────────────────────────
describe('OrderCard', () => {
  beforeEach(() => jest.clearAllMocks())

  // ── Basic rendering ──

  it('renders product name and status badge', () => {
    render(
      <OrderCard
        order={makeOrder()}
        currentUserId="buyer-1"
        {...defaultProps}
      />,
    )
    expect(screen.getByText('Tomatoes')).toBeTruthy()
    expect(screen.getByTestId('order-status-order-1')).toBeTruthy()
  })

  it('renders other party name (seller for buyer view)', () => {
    render(
      <OrderCard
        order={makeOrder()}
        currentUserId="buyer-1"
        {...defaultProps}
      />,
    )
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('renders other party name (buyer for seller view)', () => {
    render(
      <OrderCard
        order={makeOrder()}
        currentUserId="seller-1"
        {...defaultProps}
      />,
    )
    expect(screen.getByText('Alice')).toBeTruthy()
  })

  it('shows delivery address', () => {
    render(
      <OrderCard
        order={makeOrder({ delivery_address: '123 Main St' })}
        currentUserId="buyer-1"
        {...defaultProps}
      />,
    )
    expect(screen.getByText('123 Main St')).toBeTruthy()
  })

  it('shows delivery date', () => {
    render(
      <OrderCard
        order={makeOrder({ delivery_date: '2026-03-01' })}
        currentUserId="buyer-1"
        {...defaultProps}
      />,
    )
    expect(screen.getByText(/Mar/)).toBeTruthy()
  })

  it('shows quantity and price', () => {
    render(
      <OrderCard
        order={makeOrder()}
        currentUserId="buyer-1"
        {...defaultProps}
      />,
    )
    expect(screen.getByText(/5 box × 10 pts = 50 pts/)).toBeTruthy()
  })

  // ── Card press ──

  it('calls onPress with order when card is tapped', () => {
    const onPress = jest.fn()
    render(
      <OrderCard
        order={makeOrder()}
        currentUserId="buyer-1"
        onPress={onPress}
        t={t}
      />,
    )
    fireEvent.press(screen.getByTestId('order-card-order-1'))
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'order-1' }))
  })

  // ── Delivery proof ──

  it('shows delivery proof when delivered', () => {
    render(
      <OrderCard
        order={makeOrder({
          status: 'delivered',
          delivery_proof_timestamp: '2026-02-16T14:30:00Z',
        })}
        currentUserId="buyer-1"
        {...defaultProps}
      />,
    )
    expect(screen.getAllByText(/Delivered/).length).toBeGreaterThanOrEqual(1)
  })

  // ── Escalated notice ──

  it('shows escalated notice for escalated orders', () => {
    render(
      <OrderCard
        order={makeOrder({ status: 'escalated' })}
        currentUserId="buyer-1"
        {...defaultProps}
      />,
    )
    expect(screen.getByText(/community review/)).toBeTruthy()
  })

  // ── No action buttons ──

  it('does not render any action buttons', () => {
    render(
      <OrderCard
        order={makeOrder({ status: 'pending' })}
        currentUserId="buyer-1"
        {...defaultProps}
      />,
    )
    expect(screen.queryByTestId('order-action-cancel')).toBeNull()
    expect(screen.queryByTestId('order-action-modify')).toBeNull()
    expect(screen.queryByTestId('order-action-accept')).toBeNull()
    expect(screen.queryByTestId('order-action-reject')).toBeNull()
  })

  // ── Status rendering for different statuses ──

  const statuses: OrderStatus[] = [
    'pending', 'accepted', 'delivered', 'completed',
    'cancelled', 'disputed', 'escalated',
  ]

  statuses.forEach((status) => {
    it(`renders card for ${status} status without errors`, () => {
      expect(() =>
        render(
          <OrderCard
            order={makeOrder({ status })}
            currentUserId="buyer-1"
            {...defaultProps}
          />,
        ),
      ).not.toThrow()
    })
  })
})
