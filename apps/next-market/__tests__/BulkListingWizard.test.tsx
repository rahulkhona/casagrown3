import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import BulkListingWizard from '../app/(main)/list_bulk/BulkListingWizard'

let mockSearchParams = new URLSearchParams()
let mockUser: any = null
let mockIsAuthenticated = false

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock('../lib/useAuth', () => ({
  useAuth: () => ({
    get user() {
      return mockUser
    },
    get isAuthenticated() {
      return mockIsAuthenticated
    },
    isLoading: false,
    loading: false,
    tosAccepted: true,
    refresh: vi.fn(),
  }),
}))

vi.mock('../lib/useBootstrap', () => ({
  useBootstrap: () => ({
    get user() {
      return mockUser
    },
    get isAuthenticated() {
      return mockIsAuthenticated
    },
    isLoading: false,
    loading: false,
    data: { profile: { full_name: 'Test Seller' } },
    refresh: vi.fn(),
  }),
}))

vi.mock('../lib/supabase', () => ({
  createClient: () => mockSupabase,
}))

const mockInserts: Record<string, any[]> = {}

const createQueryChain = (tableName: string) => {
  const queryResult = {
    data: tableName === 'market_products'
      ? [{ id: 'prod-123', name: 'Tomatoes' }]
      : tableName === 'market_booths'
      ? [{ id: 'booth-123', name: "Test Seller's Stand", booth_zip: '95120', delivery_zipcodes: ['95120'], offers_delivery: true, offers_pickup: true, pickup_street: '123 Apple Tree Ln', pickup_city: 'San Jose', pickup_state: 'CA', pickup_zip: '95120', delivery_radius_miles: 5 }]
      : { id: 'user-123', full_name: 'Test Seller' },
    error: null,
  }

  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn((payload: any) => {
      if (!mockInserts[tableName]) mockInserts[tableName] = []
      mockInserts[tableName].push(payload)
      return builder
    }),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(queryResult)),
    single: vi.fn(() => Promise.resolve({ data: Array.isArray(queryResult.data) ? queryResult.data[0] : queryResult.data, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: Array.isArray(queryResult.data) ? queryResult.data[0] : queryResult.data, error: null })),
    then: (resolve: any, reject: any) => Promise.resolve(queryResult).then(resolve, reject),
  }
  return builder
}

const mockFromSpy = vi.fn((tableName: string) => createQueryChain(tableName))

const mockSupabase = {
  from: mockFromSpy,
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: mockUser ? { user: mockUser } : null }, error: null })),
    getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser }, error: null })),
    updateUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
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
  rpc: vi.fn().mockResolvedValue({ data: 'booth-123', error: null }),
}

vi.mock('../lib/supabase', () => ({
  createClient: () => mockSupabase,
}))

describe('BulkListingWizard (Exhaustive E2E Form & Button Matrix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthenticated = false
    mockUser = null
    mockSearchParams = new URLSearchParams()
  })

  afterEach(() => {
    cleanup()
  })

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1: ITEM GRID, CUSTOM ITEM & MODAL EDITING TESTS
  // ──────────────────────────────────────────────────────────────────────────

  it('renders Step 1 with items from URL parameters and + Add Custom Item card', async () => {
    mockSearchParams = new URLSearchParams('produce=blueberries,tomatoes,cucumbers')
    render(<BulkListingWizard />)

    expect(screen.getByText(/Select crops you want to sell/i)).toBeDefined()
    expect(screen.getByText('Blueberries')).toBeDefined()
    expect(screen.getByText('Tomatoes')).toBeDefined()
    expect(screen.getByText('Cucumbers')).toBeDefined()
    expect(screen.getByText(/Add Custom Item/i)).toBeDefined()
  })

  it('renders seasonal fallback crops when no query parameters are provided', async () => {
    render(<BulkListingWizard />)

    expect(screen.getByText('Tomatoes')).toBeDefined()
    expect(screen.getByText('Cucumbers')).toBeDefined()
    expect(screen.getByText(/Add Custom Item/i)).toBeDefined()
  })

  it('fetches and displays dynamic buyer demand and produce-specific badge for detected zipcode', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes,cucumbers&zipcode=95120')
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/interest/demand')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            zipcode: '95120',
            totalBuyers: 3,
            locationLabel: 'In 95120',
            produceCounts: { tomatoes: 2, tomato: 2, cucumbers: 1 },
          }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<BulkListingWizard />)

    await waitFor(() => {
      expect(screen.getByText('3')).toBeDefined()
      expect(screen.getByText('Buyer Requests')).toBeDefined()
    })

    global.fetch = originalFetch
  })

  it('renders 0 buyer requests and ready-to-list badge when no buyers exist in zipcode', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes&zipcode=99999')
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/interest/demand')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            zipcode: '99999',
            totalBuyers: 0,
            locationLabel: 'In 99999',
            produceCounts: {},
          }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<BulkListingWizard />)

    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
      expect(screen.getByText('Buyer Requests')).toBeDefined()
    })

    global.fetch = originalFetch
  })



  it('tests full modal field editing: price, unit, quantity, harvest date, and description', async () => {
    mockSearchParams = new URLSearchParams('produce=blueberries')
    render(<BulkListingWizard />)

    // Open Blueberries edit modal via ✎ Edit button
    fireEvent.click(screen.getByText(/✎ Edit/i))

    await waitFor(() => {
      expect(screen.getByText('Price ($)')).toBeDefined()
    })

    // 1. Edit Price
    const numberInputs = screen.getAllByRole('spinbutton')
    const priceInput = numberInputs[0]
    fireEvent.change(priceInput, { target: { value: '4.50' } })
    expect(screen.getByDisplayValue('4.50')).toBeDefined()

    // 2. Change Unit Dropdown
    const unitSelect = screen.getByDisplayValue('lb')
    fireEvent.change(unitSelect, { target: { value: 'box' } })
    expect(screen.getByDisplayValue('box')).toBeDefined()

    // 3. Edit Quantity and verify dynamic pluralization suffix (boxes)
    const qtyInput = numberInputs[1]
    fireEvent.change(qtyInput, { target: { value: '8' } })
    expect(screen.getByDisplayValue('8')).toBeDefined()
    expect(screen.getByText('boxes')).toBeDefined()

    // 4. Test Harvest Date with various intervals
    const now = new Date()
    const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const harvestInput = screen.getByText(/Harvest Date/i).parentElement?.querySelector('input[type="date"]')
    
    if (harvestInput) {
      // Test Yesterday
      const yDate = new Date(now)
      yDate.setDate(yDate.getDate() - 1)
      const yesterday = formatDate(yDate)
      fireEvent.change(harvestInput, { target: { value: yesterday } })
      expect(screen.getByText(/Harvested yesterday — very fresh!/i)).toBeDefined()

      // Test 3 Days Ago
      const threeDaysDate = new Date(now)
      threeDaysDate.setDate(threeDaysDate.getDate() - 3)
      const threeDaysStr = formatDate(threeDaysDate)
      fireEvent.change(harvestInput, { target: { value: threeDaysStr } })
      expect(screen.getByText(/Harvested 3 days ago — fresh!/i)).toBeDefined()
    }

    // 5. Edit Description
    const descInput = screen.getByPlaceholderText(/e\.g\., Picked fresh this morning!/i)
    fireEvent.change(descInput, { target: { value: 'Freshly harvested sweet blueberries from our organic bush' } })
    expect(screen.getByDisplayValue('Freshly harvested sweet blueberries from our organic bush')).toBeDefined()

    // Save and verify card displays updated values
    fireEvent.click(screen.getByText(/Save Details/i))
    await waitFor(() => {
      expect(screen.getByText('$4.50 / box')).toBeDefined()
    })
  })

  it('allows creating a new custom item, entering name, and removing an item', async () => {
    render(<BulkListingWizard />)

    // Click + Add Custom Item
    const addCustomBtn = screen.getByText(/Add Custom Item/i).closest('div')
    if (addCustomBtn) fireEvent.click(addCustomBtn)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. Meyer Lemons, Fresh Honey/i)).toBeDefined()
    })

    const nameInput = screen.getByPlaceholderText(/e\.g\. Meyer Lemons, Fresh Honey/i)
    fireEvent.change(nameInput, { target: { value: 'Artisan Sourdough' } })

    // Save custom item
    fireEvent.click(screen.getByText(/Save Details/i))

    await waitFor(() => {
      expect(screen.getByText('Artisan Sourdough')).toBeDefined()
    })

    // Reopen modal and click Remove Item
    const editBtns = screen.getAllByText(/✎ Edit/i)
    fireEvent.click(editBtns[editBtns.length - 1]!)
    await waitFor(() => {
      expect(screen.getByText(/Remove Item/i)).toBeDefined()
    })
    fireEvent.click(screen.getByText(/Remove Item/i))

    // Verify item is removed from active selection
    await waitFor(() => {
      expect(screen.getByText(/0 of \d+ selected/i)).toBeDefined()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1 -> STEP 2 NAVIGATION & BACK BUTTON
  // ──────────────────────────────────────────────────────────────────────────

  it('disables proceed button when 0 items selected and transitions to Step 2 when >= 1 item selected', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes')
    render(<BulkListingWizard />)

    expect(screen.getByText(/0 of \d+ selected/i)).toBeDefined()
    expect(screen.getByText(/Select crops above to continue/i)).toBeDefined()

    // 1-tap select Tomatoes
    fireEvent.click(screen.getByText('Tomatoes'))

    await waitFor(() => {
      expect(screen.getByText(/Sell 1 Selected Crop/i)).toBeDefined()
    })

    fireEvent.click(screen.getByText(/Sell 1 Selected Crop/i))

    // Verify Step 2 rendered
    await waitFor(() => {
      expect(screen.getByText(/How should buyers get this\?/i)).toBeDefined()
      expect(screen.getByText(/← Back to items/i)).toBeDefined()
    })

    // Click ← Back to items
    fireEvent.click(screen.getByText(/← Back to items/i))
    await waitFor(() => {
      expect(screen.getByText(/Select crops you want to sell/i)).toBeDefined()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: FULFILLMENT TOGGLES, ADDRESS, AND RADIUS
  // ──────────────────────────────────────────────────────────────────────────

  it('toggles delivery and pickup checkboxes and edits pickup address and ZIP codes', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes')
    render(<BulkListingWizard />)

    // 1-tap select Tomatoes and proceed
    fireEvent.click(screen.getByText('Tomatoes'))
    await waitFor(() => expect(screen.getByText(/Sell 1 Selected Crop/i)).toBeDefined())
    fireEvent.click(screen.getByText(/Sell 1 Selected Crop/i))

    await waitFor(() => {
      expect(screen.getByText(/I can deliver to neighbors/i)).toBeDefined()
      expect(screen.getByText(/Buyers can pick up from me/i)).toBeDefined()
    })

    // 1. Enter Delivery ZIP
    const zipInput = screen.getByPlaceholderText(/e\.g\. 95120 or 95120, 95123/i)
    fireEvent.change(zipInput, { target: { value: '94024, 94022' } })
    expect(screen.getByDisplayValue('94024, 94022')).toBeDefined()

    // 2. Enable Pickup checkbox and edit Pickup Address
    const checkboxes = screen.getAllByRole('checkbox')
    const pickupCheckbox = checkboxes[1]
    fireEvent.click(pickupCheckbox)

    const streetInput = screen.getByPlaceholderText(/123 Apple Tree Ln/i)
    fireEvent.change(streetInput, { target: { value: '456 Garden Lane' } })
    expect(screen.getByDisplayValue('456 Garden Lane')).toBeDefined()


    const cityInput = screen.getByPlaceholderText(/^City$/i)
    fireEvent.change(cityInput, { target: { value: 'Los Altos' } })
    expect(screen.getByDisplayValue('Los Altos')).toBeDefined()
  })

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: SCHEDULE PRESETS & CUSTOM SCHEDULE MATRIX
  // ──────────────────────────────────────────────────────────────────────────

  it('tests all schedule presets and toggling hourly cells in custom calendar matrix', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes')
    render(<BulkListingWizard />)

    fireEvent.click(screen.getByText('Tomatoes'))
    await waitFor(() => expect(screen.getByText(/Sell 1 Selected Crop/i)).toBeDefined())
    fireEvent.click(screen.getByText(/Sell 1 Selected Crop/i))

    await waitFor(() => {
      expect(screen.getAllByText(/Weekday evenings/i)[0]).toBeDefined()
      expect(screen.getAllByText(/Weekend mornings/i)[0]).toBeDefined()
      expect(screen.getAllByText(/Both \(Recommended\)/i)[0]).toBeDefined()
      expect(screen.getAllByText(/Custom schedule/i)[0]).toBeDefined()
    })

    // Click Weekday evenings preset
    fireEvent.click(screen.getAllByText(/Weekday evenings/i)[0]!)
    // Click Weekend mornings preset
    fireEvent.click(screen.getAllByText(/Weekend mornings/i)[0]!)
    // Click Both preset
    fireEvent.click(screen.getAllByText(/Both \(Recommended\)/i)[0]!)

    // Open Custom schedule matrix
    fireEvent.click(screen.getAllByText(/Custom schedule/i)[0]!)

    await waitFor(() => {
      expect(screen.getByText(/Tap any hour cell to set custom delivery hours/i)).toBeDefined()
    })

    // Find and click an hourly cell in the matrix table
    const matrixButtons = screen.getAllByRole('button').filter(b => b.textContent === '✓' || b.textContent === '')
    if (matrixButtons.length > 0) {
      fireEvent.click(matrixButtons[0])
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: LEGAL MODALS (TERMS OF SERVICE & PRIVACY POLICY)
  // ──────────────────────────────────────────────────────────────────────────

  it('opens and closes Terms of Service and Privacy Policy in-modal overlays', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes')
    render(<BulkListingWizard />)

    fireEvent.click(screen.getByText('Tomatoes'))
    await waitFor(() => expect(screen.getByText(/Sell 1 Selected Crop/i)).toBeDefined())
    fireEvent.click(screen.getByText(/Sell 1 Selected Crop/i))

    // Open Terms of Service modal
    const tosLink = screen.getByRole('button', { name: /Terms of Service/i })
    fireEvent.click(tosLink)

    await waitFor(() => {
      expect(screen.getByText(/📜 Terms of Service/i)).toBeDefined()
    })

    // Close TOS modal
    const closeTosBtn = screen.getByText('✕')
    fireEvent.click(closeTosBtn)

    // Open Privacy Policy modal
    const privacyLink = screen.getByRole('button', { name: /Privacy Policy/i })
    fireEvent.click(privacyLink)

    await waitFor(() => {
      expect(screen.getByText(/🔒 Privacy Policy/i)).toBeDefined()
    })

    // Close Privacy modal
    const closePrivacyBtn = screen.getByText('✕')
    fireEvent.click(closePrivacyBtn)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: GUEST AUTH FLOW (GOOGLE, APPLE, EMAIL OTP)
  // ──────────────────────────────────────────────────────────────────────────

  it('tests guest auth provider clicks (Google, Apple, and Email OTP verification)', async () => {
    mockSearchParams = new URLSearchParams('produce=tomatoes&zipcode=95120')

    render(<BulkListingWizard />)

    fireEvent.click(screen.getByText('Tomatoes'))
    await waitFor(() => expect(screen.getByText(/Sell 1 Selected Crop/i)).toBeDefined())
    fireEvent.click(screen.getByText(/Sell 1 Selected Crop/i))

    // Accept TOS
    const tosCheckboxes = screen.getAllByRole('checkbox')
    // Step 2 has Delivery checkbox, Pickup checkbox, and TOS checkbox (last one)
    const tosCheckbox = tosCheckboxes[tosCheckboxes.length - 1]
    fireEvent.click(tosCheckbox)

    // 1. Click Continue with Google
    const googleBtn = screen.getByText(/Continue with Google/i)
    fireEvent.click(googleBtn)
    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    )

    // 2. Click Continue with Apple
    const appleBtn = screen.getByText(/Continue with Apple/i)
    fireEvent.click(appleBtn)
    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'apple' })
    )

    // 3. Test Email OTP flow
    const nameInput = screen.getByPlaceholderText(/e\.g\. Sarah Jenkins/i)
    fireEvent.change(nameInput, { target: { value: 'Guest Seller' } })

    const emailInput = screen.getByPlaceholderText(/e\.g\. sarah@example\.com|Email address/i)
    fireEvent.change(emailInput, { target: { value: 'guest@example.com' } })

    const getCodeBtn = screen.getByText(/Get Code/i)
    fireEvent.click(getCodeBtn)

    await waitFor(() => {
      expect(mockSupabase.auth.signInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'guest@example.com' })
      )
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: LOGGED-IN PUBLISHING, ACCOUNT BADGE, AND MARKETPLACE ASSERTION
  // ──────────────────────────────────────────────────────────────────────────

  it('pre-fills seller name, supports sign out, and asserts complete product publishing payload for /market', async () => {
    mockIsAuthenticated = true
    mockUser = { id: 'seller-789', email: 'grower@casagrown.com' }
    mockSearchParams = new URLSearchParams('produce=tomatoes&zipcode=95120')

    render(<BulkListingWizard />)

    // 1-tap select Tomatoes
    fireEvent.click(screen.getByText('Tomatoes'))
    await waitFor(() => expect(screen.getByText(/Sell 1 Selected Crop/i)).toBeDefined())

    // Proceed to Step 2
    fireEvent.click(screen.getByText(/Sell 1 Selected Crop/i))


    // Wait for Step 2 to mount completely
    await waitFor(() => {
      expect(screen.getByText(/Publish Your Listings/i)).toBeDefined()
      expect(screen.getByText(/Signed in as/i)).toBeDefined()
      expect(screen.getByText(/grower@casagrown\.com/i)).toBeDefined()
      expect(screen.getByText(/Sign out/i)).toBeDefined()
    })

    // Accept TOS
    await waitFor(() => {
      expect(document.getElementById('tos-checkbox')).not.toBeNull()
    })
    const tosCheckbox = document.getElementById('tos-checkbox')!
    fireEvent.click(tosCheckbox)

    // Click Publish button
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Publish/i })
      expect((btn as HTMLButtonElement).disabled).toBe(false)
    })
    const publishBtn = screen.getByRole('button', { name: /Publish/i })
    fireEvent.click(publishBtn)



    // Assert that market_products.insert was executed and saved correct fields
    await waitFor(() => {
      expect(mockFromSpy).toHaveBeenCalledWith('market_products')
      expect(mockInserts['market_products']).toBeDefined()
      expect(mockInserts['market_products'].length).toBeGreaterThan(0)
    })

    const insertedProductList = mockInserts['market_products'][0]
    expect(insertedProductList).toBeDefined()
    expect(insertedProductList.length).toBe(1)
    const product = insertedProductList[0]

    expect(product).toMatchObject({
      name: 'Tomatoes',
      seller_id: 'seller-789',
      is_active: true,
      is_draft: false,
      delivery_zipcodes: ['95120'],
      pickup_notice_minutes: 30,
    })
    expect(product.product_delivery_windows).toBeDefined()
    expect(product.product_pickup_windows).toBeDefined()
    expect(product.window_dates).toBeDefined()
    expect(Array.isArray(product.window_dates)).toBe(true)

    // Assert that implicit sell interest was saved in crm_produce_interests
    expect(mockFromSpy).toHaveBeenCalledWith('crm_produce_interests')
    expect(mockInserts['crm_produce_interests']).toBeDefined()
    const insertedInterests = mockInserts['crm_produce_interests'][0]
    expect(insertedInterests[0]).toMatchObject({
      user_id: 'seller-789',
      produce_name: 'tomatoes',
      interest_type: 'sell',
      zipcodes: ['95120'],
    })
  })
})
