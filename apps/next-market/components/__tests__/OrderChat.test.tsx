// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock CSS module
vi.mock('../OrderChat.module.css', () => ({ default: new Proxy({}, { get: (_, key) => key }) }))

// Unmock OrderChat itself (the global setup.ts mocks it to null)
vi.unmock('../OrderChat')

// Mock supabase client
const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })
const mockRpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null })
const mockSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue({ data: [], error: null })
  })
})
const mockFrom = vi.fn().mockReturnValue({
  insert: mockInsert,
  select: mockSelect,
})

vi.mock('../../lib/supabase', () => ({
  createClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-123',
      email: 'test@test.com',
      user_metadata: { full_name: 'Test User' },
    },
  }),
}))

import OrderChat from '../OrderChat'

describe('OrderChat', () => {
  const baseProps = {
    orderId: 'order-1',
    otherUserName: 'Other User',
    otherUserId: 'user-456',
  }

  beforeEach(() => {
    mockInsert.mockClear()
    mockRpc.mockClear()
  })

  it('shows "Ready for Pickup" chip only when isSeller && pickup && pending', () => {
    render(
      <OrderChat
        {...baseProps}
        isSeller={true}
        fulfillmentType="pickup"
        orderStatus="pending"
      />
    )
    expect(screen.getByText('✅ Ready for Pickup')).toBeDefined()
  })

  it('hides "Ready for Pickup" chip when status is not pending', () => {
    render(
      <OrderChat
        {...baseProps}
        isSeller={true}
        fulfillmentType="pickup"
        orderStatus="delivered"
      />
    )
    expect(screen.queryByText('✅ Ready for Pickup')).toBeNull()
  })

  it('hides "Ready for Pickup" chip when user is buyer', () => {
    render(
      <OrderChat
        {...baseProps}
        isSeller={false}
        fulfillmentType="pickup"
        orderStatus="pending"
      />
    )
    expect(screen.queryByText('✅ Ready for Pickup')).toBeNull()
  })

  it('shows "On my way..." chip for seller + delivery + pending', () => {
    render(
      <OrderChat
        {...baseProps}
        isSeller={true}
        fulfillmentType="delivery"
        orderStatus="pending"
      />
    )
    expect(screen.getByText('🚗 On my way...')).toBeDefined()
  })

  it('shows "On my way to pick up..." chip for buyer + pickup + delivered', () => {
    render(
      <OrderChat
        {...baseProps}
        isSeller={false}
        fulfillmentType="pickup"
        orderStatus="delivered"
      />
    )
    expect(screen.getByText('🚗 On my way to pick up...')).toBeDefined()
  })

  it('hides "On my way..." chip for wrong fulfillment type', () => {
    render(
      <OrderChat
        {...baseProps}
        isSeller={true}
        fulfillmentType="pickup"
        orderStatus="pending"
      />
    )
    expect(screen.queryByText('🚗 On my way...')).toBeNull()
  })
})
