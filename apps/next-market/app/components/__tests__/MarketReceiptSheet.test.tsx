// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, fireEvent } from '@testing-library/react'

import { MarketReceiptSheet, type MarketReceiptData } from '../MarketReceiptSheet'

const buyerData: MarketReceiptData = {
  orderId: 'order-abc123-def456',
  date: '2026-03-12T08:15:00Z',
  status: 'completed',
  sellerName: 'Maria Garcia',
  boothName: "Maria's Garden Fresh",
  sellerZip: '95112',
  buyerName: 'Alex Rivera',
  buyerZip: '95113',
  productName: 'Heritage Tomatoes',
  quantity: 2,
  unitPrice: 4.50,
  subtotal: 9.00,
  taxRate: 9.25,
  taxAmount: 0.83,
  total: 9.83,
  fulfillment: 'pickup',
  viewAs: 'buyer',
}

const sellerData: MarketReceiptData = {
  ...buyerData,
  viewAs: 'seller',
  platformFee: 0.90,
  platformFeePct: 10,
  netPayout: 8.10,
  settlementId: 'settle-xyz789-abc123',
  cardLast4: '4242',
}

describe('MarketReceiptSheet', () => {
  it('returns null when not visible', () => {
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: false, data: buyerData, onClose: vi.fn() })
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders buyer receipt', () => {
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: buyerData, onClose: vi.fn() })
    )
    expect(container.textContent).toContain('Purchase Receipt')
    expect(container.textContent).toContain('Heritage Tomatoes')
    expect(container.textContent).toContain('Alex Rivera')
    expect(container.textContent).toContain('Maria Garcia')
    expect(container.textContent).toContain("Maria's Garden Fresh")
  })

  it('renders seller receipt with "You Received" when settlementId present', () => {
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: sellerData, onClose: vi.fn() })
    )
    expect(container.textContent).toContain('Sale Receipt')
    expect(container.textContent).toContain('Platform Fee')
    expect(container.textContent).toContain('You Received')
  })

  it('renders seller receipt with "You Will Receive" when no settlementId', () => {
    const unsettledSeller = { ...sellerData, settlementId: undefined }
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: unsettledSeller, onClose: vi.fn() })
    )
    expect(container.textContent).toContain('You Will Receive')
    expect(container.textContent).not.toContain('You Received')
  })

  it('shows settlement disclaimer when unsettled', () => {
    const unsettledSeller = { ...sellerData, settlementId: undefined }
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: unsettledSeller, onClose: vi.fn() })
    )
    expect(container.textContent).toContain('pending settlement')
  })

  it('hides settlement disclaimer when settled', () => {
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: sellerData, onClose: vi.fn() })
    )
    expect(container.textContent).not.toContain('pending settlement')
  })

  it('shows truncated order ID', () => {
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: buyerData, onClose: vi.fn() })
    )
    expect(container.textContent).toContain('order-ab...456')
  })

  it('displays tax rate when > 0', () => {
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: buyerData, onClose: vi.fn() })
    )
    expect(container.textContent).toContain('9.25%')
  })

  it('shows settlement info for seller', () => {
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: sellerData, onClose: vi.fn() })
    )
    expect(container.textContent).toContain('4242')
  })

  it('shows fulfillment type', () => {
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: buyerData, onClose: vi.fn() })
    )
    expect(container.textContent).toContain('Market Pickup')
  })

  it('shows delivery for delivery fulfillment', () => {
    const deliveryData = { ...buyerData, fulfillment: 'delivery' }
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: deliveryData, onClose: vi.fn() })
    )
    expect(container.textContent).toContain('Market Delivery')
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: buyerData, onClose })
    )
    const closeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('✕'))
    fireEvent.click(closeBtn!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders receipt footer when provided', () => {
    const withFooter = { ...buyerData, receiptFooter: 'Cottage Food Operation — Not inspected by health department' }
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: withFooter, onClose: vi.fn() })
    )
    expect(container.textContent).toContain('Cottage Food Operation')
  })

  it('hides optional fields when not provided', () => {
    const minimal = { ...buyerData, sellerZip: undefined, buyerZip: undefined, boothName: undefined }
    const { container } = render(
      React.createElement(MarketReceiptSheet, { visible: true, data: minimal, onClose: vi.fn() })
    )
    // Booth name should not appear
    expect(container.textContent).not.toContain("Maria's Garden Fresh")
  })
})
