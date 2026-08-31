// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import MarketPage from '../page'

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}
const mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/market',
  useSearchParams: () => mockSearchParams,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => React.createElement('a', { href, ...props }, children),
}))

vi.mock('../../../../lib/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'grower@test.local' },
    isAuthenticated: true,
    tosAccepted: true,
    refresh: vi.fn(),
  }),
}))

vi.mock('../../../../lib/useBootstrap', () => ({
  useBootstrap: () => ({
    data: {
      profile: { id: 'test-user-id', zip_code: '95125', city: 'San Jose', state: 'CA' },
    },
    loading: false,
    user: { id: 'test-user-id', email: 'grower@test.local' },
    refresh: vi.fn(),
  }),
}))

vi.mock('../../../../lib/useQuickSetup', () => ({
  useQuickSetup: () => ({
    requireAuth: vi.fn(({ onReady }: any) => onReady?.()),
  }),
  QuickSetupProvider: ({ children }: any) => React.createElement('div', null, children),
}))

function chain(data: any = [], error: any = null) {
  const result = { data: data ?? [], error }
  const c: any = {}
  const methods = ['select', 'eq', 'neq', 'single', 'maybeSingle', 'limit', 'is', 'gt', 'lt', 'gte', 'lte', 'in', 'insert', 'update', 'upsert', 'delete', 'match', 'order', 'contains', 'or', 'ilike', 'like']
  for (const m of methods) c[m] = vi.fn().mockReturnValue(c)
  c.single.mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error })
  c.maybeSingle.mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error })
  c.then = (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject)
  c.catch = (reject: any) => Promise.resolve(result).catch(reject)
  c.finally = (cb: any) => Promise.resolve(result).finally(cb)
  return c
}

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'grower@test.local' } },
      error: null,
    }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'fake-token', user: { id: 'test-user-id', email: 'grower@test.local' } } },
      error: null,
    }),
  },
  from: (table: string) => {
    if (table === 'usda_market_cache') {
      return chain({
        markets: [{ listing_name: 'Willow Glen Farmers Market', distance: 2.1, location_address: '1425 Lincoln Ave, San Jose, CA' }],
        farms: [],
      })
    }
    return chain([])
  },
  rpc: () => Promise.resolve({ data: [], error: null }),
  functions: {
    invoke: vi.fn().mockResolvedValue({
      data: {
        data: [{ listing_name: 'Willow Glen Farmers Market', distance: 2.1, location_address: '1425 Lincoln Ave, San Jose, CA' }],
        farms: [],
      },
      error: null,
    }),
  },
}

vi.mock('../../../../lib/supabase', () => ({
  createClient: () => mockSupabase,
}))

describe('MarketProducePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, lead_id: 'lead-123' }),
      text: async () => 'OK',
    } as any)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders search bar and location bar in sticky header', async () => {
    render(<MarketPage />)

    expect(screen.getByRole('link', { name: /Add Produce/i })).toHaveAttribute('href', '/my-booth/products/new')
    expect(screen.getByPlaceholderText(/Search produce/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Address or ZIP/i)).toBeInTheDocument()
  })

  it('filters produce cards when typing in the produce search bar', async () => {
    render(<MarketPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Lemons' })).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search produce/i)
    fireEvent.change(searchInput, { target: { value: 'Lemons' } })

    expect(screen.getByRole('heading', { level: 3, name: 'Lemons' })).toBeInTheDocument()
  })

  it('displays zero-results state when search has no matching produce', async () => {
    render(<MarketPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Lemons' })).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search produce/i)
    fireEvent.change(searchInput, { target: { value: 'Dragonfruit' } })

    expect(screen.getByText(/No active listings for.*Dragonfruit.*nearby/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Want Dragonfruit/i })).toBeInTheDocument()
    const addLinks = screen.getAllByRole('link', { name: /\+ Add Produce/i })
    expect(addLinks.some(l => l.getAttribute('href') === '/my-booth/products/new?name=Dragonfruit')).toBe(true)

    // Test prohibited term (e.g. gun)
    fireEvent.change(searchInput, { target: { value: 'gun' } })
    expect(screen.getByText(/Prohibited Search Term/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Want gun/i })).not.toBeInTheDocument()

    // Test non-garden item (e.g. chair)
    fireEvent.change(searchInput, { target: { value: 'chair' } })
    expect(screen.getByText(/Not a recognized garden item/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Want chair/i })).not.toBeInTheDocument()

    // Test valid garden equipment & supplies (wooden pots & soil)
    fireEvent.change(searchInput, { target: { value: 'wooden pots' } })
    expect(screen.getByText(/No active listings for.*wooden pots.*nearby/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Want wooden pots/i })).toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: 'potting soil' } })
    expect(screen.getByText(/No active listings for.*potting soil.*nearby/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Want potting soil/i })).toBeInTheDocument()
  })

  it('opens listing modal when clicking Have Extra on a crop card', async () => {
    render(<MarketPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Apples' })).toBeInTheDocument()
    })

    const haveExtraButtons = screen.getAllByRole('button', { name: /Have Extra/i })
    expect(haveExtraButtons.length).toBeGreaterThan(0)

    // Click Have Extra on first card
    fireEvent.click(haveExtraButtons[0])

    // Listing modal should open directly with that crop
    expect(screen.getByText(/List Surplus Produce/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Publish.*Crop Listing/i })).toBeInTheDocument()
  })

  it('opens Want modal when clicking Want button and displays Instacart and USDA markets after signal submission', async () => {
    // Mock successful fetch for interest submission
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as any)

    render(<MarketPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Apples' })).toBeInTheDocument()
    })

    const wantButtons = screen.getAllByRole('button', { name: /Want/i })
    expect(wantButtons.length).toBeGreaterThan(0)

    fireEvent.click(wantButtons[0])

    expect(screen.getByLabelText(/Desired Quantity/i)).toBeInTheDocument()

    // Select Pickup fulfillment preference
    const pickupBtn = screen.getByRole('button', { name: /Pickup/i })
    fireEvent.click(pickupBtn)

    // Submit the demand signal
    const form = screen.getByRole('button', { name: /Find sellers in my neighborhood/i }).closest('form')
    expect(form).toBeInTheDocument()
    fireEvent.submit(form!)

    // Post-submission confirmation hub with Instacart and USDA markets
    await waitFor(() => {
      expect(screen.getByText(/Neighbors notified/i)).toBeInTheDocument()
      expect(screen.getByText(/Instacart Delivery/i)).toBeInTheDocument()
      expect(screen.getByText(/Nearby Farmers Markets & Stands/i)).toBeInTheDocument()
      expect(screen.getByText(/Willow Glen Farmers Market/i)).toBeInTheDocument()
    })
  })

  it('allows user to type in a new ZIP code to update search location', async () => {
    render(<MarketPage />)

    const zipInput = screen.getByPlaceholderText(/Address or ZIP/i)
    fireEvent.change(zipInput, { target: { value: '94040' } })
    fireEvent.submit(zipInput.closest('form')!)

    expect((zipInput as HTMLInputElement).value).toBe('94040')
  })

  it('renders GPS Geolocation button and handles click', async () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn(),
    }
    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeolocation,
      configurable: true,
    })

    render(<MarketPage />)

    const geoButton = screen.getByRole('button', { name: /Use current location/i })
    expect(geoButton).toBeInTheDocument()

    fireEvent.click(geoButton)
    expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled()
  })

  it('prompts for delivery address when submitting harvest signal with Delivery fulfillment without an address', async () => {
    render(<MarketPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Apples' })).toBeInTheDocument()
    })

    const wantButtons = screen.getAllByRole('button', { name: /Want/i })
    fireEvent.click(wantButtons[0])

    expect(screen.getByLabelText(/Desired Quantity/i)).toBeInTheDocument()

    // Select Delivery fulfillment preference
    const deliveryBtn = screen.getByRole('button', { name: /🚗 Delivery/i })
    fireEvent.click(deliveryBtn)

    // Verify Delivery Address prompt is visible
    expect(screen.getByRole('button', { name: /Enter Delivery Address/i })).toBeInTheDocument()

    // Attempting submit without address should trigger address prompt
    const submitBtn = screen.getByRole('button', { name: /Find sellers in my neighborhood/i })
    fireEvent.click(submitBtn)

    expect(screen.getByText(/Please provide a delivery address/i)).toBeInTheDocument()
  })

  it('pre-populates delivery address when user already has a saved delivery address', async () => {
    localStorage.setItem('casagrown_delivery_address', '123 Main St, San Jose, CA 95125')
    localStorage.setItem('casagrown_delivery_fields', JSON.stringify({
      street: '123 Main St',
      city: 'San Jose',
      state: 'CA',
      zip: '95125',
    }))

    render(<MarketPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Apples' })).toBeInTheDocument()
    })

    const wantButtons = screen.getAllByRole('button', { name: /Want/i })
    fireEvent.click(wantButtons[0])

    // Select Delivery fulfillment preference
    const deliveryBtn = screen.getByRole('button', { name: /🚗 Delivery/i })
    fireEvent.click(deliveryBtn)

    // Should display the pre-populated address and Change Address button
    expect(screen.getByText(/123 Main St, San Jose, CA 95125/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Change Address/i })).toBeInTheDocument()
  })
})
