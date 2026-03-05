/**
 * ReceiptCard Compliance Tests
 *
 * Verifies the shared ReceiptCard component renders ALL required receipt fields.
 * These tests catch regressions where receipt data is silently dropped,
 * ensuring compliance fields (seller zip, buyer zip, harvest date, tax, total)
 * always appear when data is provided.
 */

import React from 'react'
import { render, screen } from '@testing-library/react-native'

jest.mock('tamagui', () => {
  const { View, Text: RNText } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
  }
})

jest.mock('../../design-tokens', () => ({
  colors: {
    green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 700: '#15803d', 800: '#166534' },
    gray: { 500: '#6b7280', 600: '#4b5563', 800: '#1f2937' },
    amber: { 700: '#b45309' },
  },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'orders.receipt.title': 'Digital Receipt',
        'orders.receipt.seller': 'Seller',
        'orders.receipt.buyer': 'Buyer',
        'orders.receipt.harvestDate': 'Harvest Date',
      }
      return map[key] || key
    },
  }),
}))

import { ReceiptCard, metadataToReceiptData, type ReceiptData } from './ReceiptCard'

// ── Full receipt data covering all compliance fields ──
const FULL_RECEIPT: ReceiptData = {
  orderId: 'd0000000-0000-0000-0000-000000000001',
  completedAt: '2026-03-05T10:00:00Z',
  sellerName: 'Test Seller',
  sellerZip: '95125',
  buyerName: 'Test Buyer',
  buyerZip: '95120',
  harvestDate: '2026-03-04',
  product: 'Tomatoes',
  quantity: 5,
  unit: 'box',
  pointsPerUnit: 25,
  subtotal: 125,
  tax: 0,
  platformFee: 13,
  sellerPayout: 112,
}

// =============================================================================
// ReceiptCard rendering
// =============================================================================

describe('ReceiptCard', () => {
  describe('renders all required compliance fields', () => {
    beforeEach(() => {
      render(<ReceiptCard data={FULL_RECEIPT} variant="card" />)
    })

    it('renders Digital Receipt title', () => {
      expect(screen.getByText('Digital Receipt')).toBeTruthy()
    })

    it('renders transaction type', () => {
      expect(screen.getByText('Affiliated Network Fulfillment')).toBeTruthy()
    })

    it('renders order ID (truncated)', () => {
      expect(screen.getByText(/d0000000.*001/)).toBeTruthy()
    })

    it('renders completion date', () => {
      expect(screen.getByText(/Mar 5, 2026/)).toBeTruthy()
    })

    it('renders seller name (not N/A)', () => {
      expect(screen.getByText('Test Seller')).toBeTruthy()
      expect(screen.queryAllByText('N/A').length).toBeLessThan(2)
    })

    it('renders seller zip code', () => {
      expect(screen.getByText('95125')).toBeTruthy()
    })

    it('renders buyer name (not N/A)', () => {
      expect(screen.getByText('Test Buyer')).toBeTruthy()
    })

    it('renders buyer zip code', () => {
      expect(screen.getByText('95120')).toBeTruthy()
    })

    it('renders harvest date', () => {
      expect(screen.getByText('2026-03-04')).toBeTruthy()
    })

    it('renders product line with name, quantity, unit, price', () => {
      expect(screen.getByText(/Tomatoes.*5.*box.*25 pts/)).toBeTruthy()
    })

    it('renders subtotal', () => {
      expect(screen.getByText('Subtotal')).toBeTruthy()
      expect(screen.getAllByText(/125.*pts/).length).toBeGreaterThanOrEqual(1)
    })

    it('renders sales tax', () => {
      expect(screen.getByText('Sales Tax')).toBeTruthy()
    })

    it('renders total (subtotal + tax)', () => {
      expect(screen.getByText('Total')).toBeTruthy()
      // Total = 125 + 0 = 125
      expect(screen.getAllByText(/125.*pts/).length).toBeGreaterThanOrEqual(1)
    })

    it('renders platform fee for seller', () => {
      expect(screen.getByText(/Platform Fee/)).toBeTruthy()
      expect(screen.getByText(/-13.*pts/)).toBeTruthy()
    })

    it('renders seller payout', () => {
      expect(screen.getByText('You Received')).toBeTruthy()
      expect(screen.getByText(/112.*pts/)).toBeTruthy()
    })
  })

  describe('buyer receipt (no platform fee)', () => {
    it('does NOT show platform fee or seller payout when not provided', () => {
      const buyerData: ReceiptData = {
        ...FULL_RECEIPT,
        platformFee: undefined,
        sellerPayout: undefined,
      }
      render(<ReceiptCard data={buyerData} variant="card" />)
      expect(screen.queryByText(/Platform Fee/)).toBeNull()
      expect(screen.queryByText('You Received')).toBeNull()
    })
  })

  describe('optional fields', () => {
    it('hides harvest date when not provided', () => {
      const noHarvest: ReceiptData = { ...FULL_RECEIPT, harvestDate: undefined }
      render(<ReceiptCard data={noHarvest} variant="inline" />)
      expect(screen.queryByText('Harvest Date')).toBeNull()
    })

    it('shows N/A when seller name is missing', () => {
      const noSeller: ReceiptData = { ...FULL_RECEIPT, sellerName: undefined }
      render(<ReceiptCard data={noSeller} variant="card" />)
      expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1)
    })

    it('shows N/A when buyer zip is missing', () => {
      const noBuyerZip: ReceiptData = { ...FULL_RECEIPT, buyerZip: undefined }
      render(<ReceiptCard data={noBuyerZip} variant="card" />)
      expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('variant rendering', () => {
    it('renders without errors in card variant', () => {
      expect(() =>
        render(<ReceiptCard data={FULL_RECEIPT} variant="card" />)
      ).not.toThrow()
    })

    it('renders without errors in inline variant', () => {
      expect(() =>
        render(<ReceiptCard data={FULL_RECEIPT} variant="inline" />)
      ).not.toThrow()
    })
  })
})

// =============================================================================
// metadataToReceiptData
// =============================================================================

describe('metadataToReceiptData', () => {
  it('maps all metadata keys to ReceiptData', () => {
    const meta = {
      order_id: 'abc123',
      completed_at: '2026-03-05T10:00:00Z',
      seller_name: 'Seller',
      seller_zip: '95125',
      buyer_name: 'Buyer',
      buyer_zip: '95120',
      harvest_date: '2026-03-04',
      product: 'Tomatoes',
      quantity: 5,
      unit: 'box',
      points_per_unit: 25,
      total: 125,
      tax: 0,
      platform_fee: 13,
      seller_payout: 112,
    }

    const result = metadataToReceiptData(meta)

    expect(result.orderId).toBe('abc123')
    expect(result.completedAt).toBe('2026-03-05T10:00:00Z')
    expect(result.sellerName).toBe('Seller')
    expect(result.sellerZip).toBe('95125')
    expect(result.buyerName).toBe('Buyer')
    expect(result.buyerZip).toBe('95120')
    expect(result.harvestDate).toBe('2026-03-04')
    expect(result.product).toBe('Tomatoes')
    expect(result.quantity).toBe(5)
    expect(result.unit).toBe('box')
    expect(result.pointsPerUnit).toBe(25)
    expect(result.subtotal).toBe(125)
    expect(result.tax).toBe(0)
    expect(result.platformFee).toBe(13)
    expect(result.sellerPayout).toBe(112)
  })

  it('falls back to subtotal when total is missing', () => {
    const meta = { subtotal: 100 }
    const result = metadataToReceiptData(meta)
    expect(result.subtotal).toBe(100)
  })

  it('computes subtotal from points_per_unit × quantity when total and subtotal missing', () => {
    const meta = { points_per_unit: 25, quantity: 4 }
    const result = metadataToReceiptData(meta)
    expect(result.subtotal).toBe(100)
  })

  it('returns undefined subtotal when no fallback available', () => {
    const meta = {}
    const result = metadataToReceiptData(meta)
    expect(result.subtotal).toBeUndefined()
  })

  it('handles missing fields gracefully', () => {
    const meta = { product: 'Basil' }
    const result = metadataToReceiptData(meta)
    expect(result.product).toBe('Basil')
    expect(result.sellerName).toBeUndefined()
    expect(result.buyerZip).toBeUndefined()
    expect(result.harvestDate).toBeUndefined()
  })
})
