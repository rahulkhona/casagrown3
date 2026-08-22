import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import BulkListingClient from '../app/(main)/list_bulk/BulkListingClient'

// ── Controllable mocks ──
const mockPush = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/list_bulk',
  useSearchParams: () => mockSearchParams,
}))

let mockIsAuthenticated = false
let mockUser: any = null

vi.mock('../lib/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: mockIsAuthenticated,
    loading: false,
    tosAccepted: true,
    refresh: vi.fn(),
  }),
}))

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'mock-booth-1' }, error: null }),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
  auth: {
    signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
  },
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ data: null, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/photo.jpg' } }),
    })),
  },
  functions: {
    invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}

vi.mock('../lib/supabase', () => ({
  createClient: () => mockSupabase,
}))

// Mock fetch for /api/location/ip
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ city: 'San Jose', state: 'CA', zip: '95125' }),
} as any)

describe('BulkListingClient Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthenticated = false
    mockUser = null
    mockSearchParams = new URLSearchParams()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders page and handles produce rows from URL params', async () => {
    mockSearchParams = new URLSearchParams('produce=avocados,sweet_corn,basil')
    render(<BulkListingClient />)

    expect(screen.getByText(/List Your Backyard Harvest/i)).toBeDefined()
    expect(screen.getByDisplayValue('Avocados')).toBeDefined()
    expect(screen.getByDisplayValue('Sweet Corn')).toBeDefined()
    expect(screen.getByDisplayValue('Basil')).toBeDefined()
  })

  it('allows adding and removing a produce row', async () => {
    mockSearchParams = new URLSearchParams('produce=lemons')
    render(<BulkListingClient />)

    const addBtn = screen.getByText(/Add Another Produce/i)
    fireEvent.click(addBtn)

    const inputs = screen.getAllByPlaceholderText('e.g. Meyer Lemons')
    expect(inputs.length).toBe(2)

    const deleteBtns = screen.getAllByTitle('Remove item')
    fireEvent.click(deleteBtns[0]!)

    const remainingInputs = screen.getAllByPlaceholderText('e.g. Meyer Lemons')
    expect(remainingInputs.length).toBe(1)
  })

  it('auto-selects item when user explicitly enters price and quantity', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes')
    render(<BulkListingClient />)

    const priceInput = screen.getByPlaceholderText('0.00')
    const qtyInput = screen.getByPlaceholderText('e.g. 5')

    // Enter price and qty
    fireEvent.change(priceInput, { target: { value: '3.50' } })
    fireEvent.change(qtyInput, { target: { value: '10' } })

    expect(screen.getByText(/1 produce item ready to publish/i)).toBeDefined()
  })

  it('displays inline content moderation error badge on prohibited input', async () => {
    mockSearchParams = new URLSearchParams('produce=lemons')
    render(<BulkListingClient />)

    const nameInputs = screen.getAllByPlaceholderText('e.g. Meyer Lemons')
    fireEvent.change(nameInputs[0]!, { target: { value: 'Fresh Weed' } })

    await waitFor(() => {
      expect(screen.getByText(/Cannabis and related topics are not allowed/i)).toBeDefined()
    })
  })

  it('renders transparent platform fee disclosure card', async () => {
    render(<BulkListingClient />)

    expect(screen.getByText(/Transparent Pricing & Seller Fees/i)).toBeDefined()
    expect(screen.getByText(/\$0 Listing Fee/i)).toBeDefined()
    expect(screen.getByText(/10% Standard Platform Fee on Sale/i)).toBeDefined()
  })

  it('toggles fulfillment delivery and pickup checkboxes and shows required badge', async () => {
    render(<BulkListingClient />)

    expect(screen.getByText(/Choose at least one \(Delivery, Pickup, or Both\) \*/i)).toBeDefined()
    expect(screen.getByText(/I can deliver to neighbors/i)).toBeDefined()
    expect(screen.getByText(/Buyers can pick up from me/i)).toBeDefined()

    const deliveryCard = screen.getByText(/I can deliver to neighbors/i).closest('div')
    if (deliveryCard) {
      fireEvent.click(deliveryCard)
    }

    expect(screen.getByText(/Deliver by Zip Code\(s\)/i)).toBeDefined()
  })

  it('supports adding and removing multiple delivery zip codes', async () => {
    render(<BulkListingClient />)

    // Enable delivery
    const deliveryCard = screen.getByText(/I can deliver to neighbors/i).closest('div')
    if (deliveryCard) {
      fireEvent.click(deliveryCard)
    }

    const zipInput = screen.getByPlaceholderText(/e\.g\. 95125, 95112/i)
    fireEvent.change(zipInput, { target: { value: '95125' } })
    fireEvent.keyDown(zipInput, { key: 'Enter' })

    expect(screen.getByText('95125')).toBeDefined()

    // Add second zip
    const nextZipInput = screen.getByPlaceholderText(/Add another ZIP\.\.\./i)
    fireEvent.change(nextZipInput, { target: { value: '95112' } })
    fireEvent.keyDown(nextZipInput, { key: 'Enter' })

    expect(screen.getByText('95112')).toBeDefined()

    // Remove first zip
    const removeBtns = screen.getAllByRole('button', { name: /Remove 95125/i })
    fireEvent.click(removeBtns[0]!)

    expect(screen.queryByText('95125')).toBeNull()
    expect(screen.getByText('95112')).toBeDefined()
  })

  it('disables publish button when no fulfillment option is selected', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes')
    render(<BulkListingClient />)

    const priceInput = screen.getByPlaceholderText('0.00')
    const qtyInput = screen.getByPlaceholderText('e.g. 5')
    fireEvent.change(priceInput, { target: { value: '3.50' } })
    fireEvent.change(qtyInput, { target: { value: '5' } })

    const publishBtn = screen.getByRole('button', { name: /Publish 1 Selected Item to My Stand/i })
    expect((publishBtn as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Please select at least 1 fulfillment option \(Delivery, Pickup, or Both\)/i)).toBeDefined()
  })

  it('enables publish button when fulfillment option and valid data are provided', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes&zipcode=95120')
    render(<BulkListingClient />)

    // Enable delivery
    const deliveryCard = screen.getByText(/I can deliver to neighbors/i).closest('div')
    if (deliveryCard) {
      fireEvent.click(deliveryCard)
    }

    const priceInput = screen.getByPlaceholderText('0.00')
    const qtyInput = screen.getByPlaceholderText('e.g. 5')
    fireEvent.change(priceInput, { target: { value: '3.50' } })
    fireEvent.change(qtyInput, { target: { value: '5' } })

    const publishBtn = screen.getByRole('button', { name: /Publish 1 Selected Item to My Stand/i })
    expect((publishBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('opens auth modal on publish when user is unauthenticated', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes&zipcode=95120')
    render(<BulkListingClient />)

    // Enable delivery
    const deliveryCard = screen.getByText(/I can deliver to neighbors/i).closest('div')
    if (deliveryCard) {
      fireEvent.click(deliveryCard)
    }

    // Set price and quantity
    const priceInput = screen.getByPlaceholderText('0.00')
    const qtyInput = screen.getByPlaceholderText('e.g. 5')
    fireEvent.change(priceInput, { target: { value: '3.50' } })
    fireEvent.change(qtyInput, { target: { value: '5' } })

    const publishBtn = screen.getByText(/Publish 1 Selected Item to My Stand/i)
    fireEvent.click(publishBtn)

    await waitFor(() => {
      expect(screen.getByText(/Save & Publish Your Listings/i)).toBeDefined()
      expect(screen.getByText(/Continue with Google/i)).toBeDefined()
      expect(screen.getByText(/Continue with Apple/i)).toBeDefined()
      expect(screen.getByText(/Continue with Email →/i)).toBeDefined()
    })
  })
})
