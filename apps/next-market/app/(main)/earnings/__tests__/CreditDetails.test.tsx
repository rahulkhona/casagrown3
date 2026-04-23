import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// ── Mock dependencies ──
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/earnings',
}))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: any) => React.createElement('a', props, children),
}))

const mockRpc = vi.fn()
const mockFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({ data: { state_code: 'CA' } })),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
    })),
  })),
}))

vi.mock('../../../../lib/supabase', () => ({
  createClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}))

vi.mock('../../../../lib/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    loading: false,
    user: { id: 'test-user-id' },
  }),
}))

vi.mock('../../../../lib/store', () => ({
  formatUsd: (v: number) => `$${v.toFixed(2)}`,
}))

vi.mock('../../../../lib/useMarketRestriction', () => ({
  useMarketRestriction: () => ({
    isFreeOnly: false,
    stateName: null,
    isBlocked: false,
  }),
}))

vi.mock('../../../../lib/useNotificationPrompt', () => ({
  useNotificationPrompt: () => ({
    showPrompt: vi.fn(),
    modalProps: { isOpen: false, onClose: vi.fn() },
  }),
}))

vi.mock('../../../components/LoadingSpinner', () => ({
  LoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading' }, 'Loading...'),
}))

vi.mock('../../../components/NotificationPromptModal', () => ({
  NotificationPromptModal: () => null,
}))

vi.mock('../../../components/NotificationBanner', () => ({
  NotificationBanner: () => null,
}))

vi.mock('../../../components/ErrorToast', () => ({
  useErrorToast: () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
  }),
}))

vi.mock('../../../components/MarketReceiptSheet', () => ({
  MarketReceiptSheet: () => null,
}))

vi.mock('../page.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => String(prop) }),
}))

// ── Test Data ──
const mockCreditBalance = {
  purchase_credits_usd: 5.00,
  platform_fee_credits_usd: 2.50,
  universal_credits_usd: 0,
  total_credits_usd: 7.50,
}

const mockCreditDetails = [
  {
    credit_id: 'credit-1',
    credit_type: 'purchase',
    source: 'escalation_resolution',
    reason: 'Late delivery compensation',
    amount_usd: 5.00,
    remaining_usd: 5.00,
    used_usd: 0,
    cap_value: 3.00,
    cap_type: 'flat_amount',
    expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
    created_at: new Date().toISOString(),
    is_expired: false,
    is_fully_used: false,
  },
  {
    credit_id: 'credit-2',
    credit_type: 'platform_fee',
    source: 'escalation_resolution',
    reason: 'Goodwill credit',
    amount_usd: 2.50,
    remaining_usd: 2.50,
    used_usd: 0,
    cap_value: 50,
    cap_type: 'percentage',
    expires_at: null,
    created_at: new Date().toISOString(),
    is_expired: false,
    is_fully_used: false,
  },
  {
    credit_id: 'credit-3',
    credit_type: 'purchase',
    source: 'promotion',
    reason: 'Welcome bonus',
    amount_usd: 10.00,
    remaining_usd: 0,
    used_usd: 10.00,
    cap_value: 5.00,
    cap_type: 'flat_amount',
    expires_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
    is_expired: true,
    is_fully_used: true,
  },
  {
    credit_id: 'credit-4',
    credit_type: 'universal',
    source: 'referral',
    reason: null,
    amount_usd: 3.00,
    remaining_usd: 3.00,
    used_usd: 0,
    cap_value: 2.00,
    cap_type: 'flat_amount',
    expires_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    created_at: new Date().toISOString(),
    is_expired: false,
    is_fully_used: false,
  },
]

const mockSummary = {
  total_sales: 0, sales_count: 0, total_purchases: 0, purchase_count: 0,
  total_fees: 0, total_redeemed: 0, total_cc_charged: 0, refunds_received: 0,
  refunds_issued: 0, net_earnings: 0, available_usd: 0, pending_usd: 0,
  held_balance_usd: 0, total_earned_usd: 0, total_spent_usd: 0, total_withdrawn_usd: 0,
}

describe('Credit Details in Earnings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockImplementation((fn: string) => {
      switch (fn) {
        case 'get_user_credit_balance':
          return Promise.resolve({ data: mockCreditBalance, error: null })
        case 'get_user_credit_details':
          return Promise.resolve({ data: mockCreditDetails, error: null })
        case 'get_transaction_log':
          return Promise.resolve({ data: [], error: null })
        case 'get_transaction_summary':
          return Promise.resolve({ data: mockSummary, error: null })
        case 'get_pending_transactions':
          return Promise.resolve({ data: [], error: null })
        default:
          return Promise.resolve({ data: null, error: null })
      }
    })
  })

  it('shows compact credits bar with total amount', async () => {
    const EarningsPage = (await import('../page')).default
    render(React.createElement(EarningsPage))
    // Compact bar shows "Credits" label and total
    expect(await screen.findByText('Credits')).toBeTruthy()
    expect(screen.getByText('$7.50')).toBeTruthy()
  })

  it('shows "▼ Details" toggle in collapsed state', async () => {
    const EarningsPage = (await import('../page')).default
    render(React.createElement(EarningsPage))
    expect(await screen.findByText('▼ Details')).toBeTruthy()
  })

  it('expands to show breakdown and table on click', async () => {
    const EarningsPage = (await import('../page')).default
    render(React.createElement(EarningsPage))

    // Table headers should not be visible yet
    const bar = await screen.findByText('▼ Details')
    expect(screen.queryByText('Left')).toBeNull()

    // Click the compact bar to expand
    fireEvent.click(bar.closest('button')!)
    expect(await screen.findByText('Left')).toBeTruthy()
    expect(screen.getByText('▲ Hide')).toBeTruthy()

    // Click again to collapse
    fireEvent.click(screen.getByText('▲ Hide').closest('button')!)
    expect(screen.queryByText('Left')).toBeNull()
  })

  it('shows credit type breakdown when expanded', async () => {
    const EarningsPage = (await import('../page')).default
    render(React.createElement(EarningsPage))

    fireEvent.click((await screen.findByText('▼ Details')).closest('button')!)
    expect(await screen.findByText(/Purchases:/)).toBeTruthy()
    expect(screen.getByText(/Seller Fees:/)).toBeTruthy()
  })

  it('shows correct credit reasons in the table', async () => {
    const EarningsPage = (await import('../page')).default
    render(React.createElement(EarningsPage))

    fireEvent.click((await screen.findByText('▼ Details')).closest('button')!)
    expect(await screen.findByText('Late delivery compensation')).toBeTruthy()
    expect(screen.getByText('Goodwill credit')).toBeTruthy()
    expect(screen.getByText('Welcome bonus')).toBeTruthy()
  })

  it('shows Active/Used status badges', async () => {
    const EarningsPage = (await import('../page')).default
    render(React.createElement(EarningsPage))

    fireEvent.click((await screen.findByText('▼ Details')).closest('button')!)
    const activeBadges = await screen.findAllByText('Active')
    const usedBadges = screen.queryAllByText('Used')

    expect(activeBadges.length).toBeGreaterThanOrEqual(2)
    expect(usedBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('shows expiring soon warning for credits expiring within 3 days', async () => {
    const EarningsPage = (await import('../page')).default
    render(React.createElement(EarningsPage))

    fireEvent.click((await screen.findByText('▼ Details')).closest('button')!)
    const expiryWarning = await screen.findByText(/2d/)
    expect(expiryWarning).toBeTruthy()
  })

  it('shows cap info per credit', async () => {
    const EarningsPage = (await import('../page')).default
    render(React.createElement(EarningsPage))

    fireEvent.click((await screen.findByText('▼ Details')).closest('button')!)
    expect(await screen.findByText('50%/order')).toBeTruthy()
  })

  it('calls get_user_credit_details RPC on mount', async () => {
    const EarningsPage = (await import('../page')).default
    render(React.createElement(EarningsPage))

    await screen.findByText('Credits')
    expect(mockRpc).toHaveBeenCalledWith('get_user_credit_details', { p_user_id: 'test-user-id' })
  })

  it('shows dash for credits with no expiration', async () => {
    const EarningsPage = (await import('../page')).default
    render(React.createElement(EarningsPage))

    fireEvent.click((await screen.findByText('▼ Details')).closest('button')!)
    // credit-2 has no expires_at, shows "—"
    expect(await screen.findByText('—')).toBeTruthy()
  })
})
