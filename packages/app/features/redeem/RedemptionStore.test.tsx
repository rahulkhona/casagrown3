/**
 * RedemptionStore State Block Compliance Tests
 *
 * Tests that the RedemptionStore correctly hides redemption tabs
 * when the user's state has blocked specific methods via
 * `state_redemption_method_blocks`.
 *
 * These tests verify the `availableTabs` logic — the pure computation
 * that determines which tabs show based on active methods + state blocks.
 */

// ── Extracted logic under test ──────────────────────────────────────────────
// The RedemptionStore component uses an `availableTabs` useMemo that depends
// on `activeMethods` and `blockedMethods`. We test the same logic here.

type Tab = 'giftCards' | 'donate' | '529' | 'cashout'

interface ActiveMethod {
  method: string
  is_active: boolean
  instruments: { instrument: string; is_active: boolean }[]
}

/** Extracted from RedemptionStore `availableTabs` useMemo */
function computeAvailableTabs(
  activeMethods: ActiveMethod[],
  blockedMethods: string[]
): Tab[] {
  const tabs: Tab[] = []

  const isMethodAvailable = (methodName: string) => {
    if (blockedMethods.includes(methodName)) return false
    const methodObj = activeMethods.find((m) => m.method === methodName)
    if (!methodObj?.is_active) return false
    if (methodObj.instruments && methodObj.instruments.length > 0) {
      return methodObj.instruments.some((inst) => inst.is_active)
    }
    return true
  }

  if (isMethodAvailable('giftcards')) tabs.push('giftCards')
  if (isMethodAvailable('charity')) tabs.push('donate')
  if (isMethodAvailable('cashout')) tabs.push('cashout')
  if (isMethodAvailable('529c')) tabs.push('529')

  return tabs
}

// ── Test data ───────────────────────────────────────────────────────────────

const ALL_METHODS_ACTIVE: ActiveMethod[] = [
  {
    method: 'giftcards',
    is_active: true,
    instruments: [
      { instrument: 'tremendous', is_active: true },
      { instrument: 'reloadly', is_active: true },
    ],
  },
  { method: 'charity', is_active: true, instruments: [] },
  {
    method: 'cashout',
    is_active: true,
    instruments: [
      { instrument: 'venmo', is_active: true },
      { instrument: 'paypal', is_active: true },
    ],
  },
  { method: '529c', is_active: true, instruments: [] },
]

// ── Tests ───────────────────────────────────────────────────────────────────

describe('RedemptionStore — State Redemption Blocks', () => {
  describe('all methods active, no blocks', () => {
    it('shows all tabs when no methods are blocked', () => {
      const tabs = computeAvailableTabs(ALL_METHODS_ACTIVE, [])
      expect(tabs).toEqual(['giftCards', 'donate', 'cashout', '529'])
    })
  })

  describe('state blocks hide specific tabs', () => {
    it('hides gift cards when giftcards is state-blocked', () => {
      const tabs = computeAvailableTabs(ALL_METHODS_ACTIVE, ['giftcards'])
      expect(tabs).not.toContain('giftCards')
      expect(tabs).toContain('donate')
      expect(tabs).toContain('cashout')
      expect(tabs).toContain('529')
    })

    it('hides cashout when cashout is state-blocked', () => {
      const tabs = computeAvailableTabs(ALL_METHODS_ACTIVE, ['cashout'])
      expect(tabs).not.toContain('cashout')
      expect(tabs).toContain('giftCards')
      expect(tabs).toContain('donate')
    })

    it('hides donate when charity is state-blocked', () => {
      const tabs = computeAvailableTabs(ALL_METHODS_ACTIVE, ['charity'])
      expect(tabs).not.toContain('donate')
      expect(tabs).toContain('giftCards')
    })

    it('hides multiple tabs when multiple methods are blocked', () => {
      const tabs = computeAvailableTabs(ALL_METHODS_ACTIVE, ['giftcards', 'cashout'])
      expect(tabs).not.toContain('giftCards')
      expect(tabs).not.toContain('cashout')
      expect(tabs).toContain('donate')
      expect(tabs).toContain('529')
    })

    it('returns empty array when ALL methods are blocked', () => {
      const tabs = computeAvailableTabs(ALL_METHODS_ACTIVE, [
        'giftcards',
        'charity',
        'cashout',
        '529c',
      ])
      expect(tabs).toEqual([])
    })
  })

  describe('provider-level deactivation', () => {
    it('hides gift cards when all instruments are inactive', () => {
      const methods: ActiveMethod[] = [
        {
          method: 'giftcards',
          is_active: true,
          instruments: [
            { instrument: 'tremendous', is_active: false },
            { instrument: 'reloadly', is_active: false },
          ],
        },
        { method: 'charity', is_active: true, instruments: [] },
      ]
      const tabs = computeAvailableTabs(methods, [])
      expect(tabs).not.toContain('giftCards')
      expect(tabs).toContain('donate')
    })

    it('shows gift cards when at least one instrument is active', () => {
      const methods: ActiveMethod[] = [
        {
          method: 'giftcards',
          is_active: true,
          instruments: [
            { instrument: 'tremendous', is_active: false },
            { instrument: 'reloadly', is_active: true },
          ],
        },
      ]
      const tabs = computeAvailableTabs(methods, [])
      expect(tabs).toContain('giftCards')
    })

    it('hides method when is_active is false even if instruments are active', () => {
      const methods: ActiveMethod[] = [
        {
          method: 'giftcards',
          is_active: false,
          instruments: [
            { instrument: 'tremendous', is_active: true },
          ],
        },
      ]
      const tabs = computeAvailableTabs(methods, [])
      expect(tabs).not.toContain('giftCards')
    })
  })

  describe('state block takes precedence over active status', () => {
    it('blocks method even when provider is active and instruments are active', () => {
      const tabs = computeAvailableTabs(ALL_METHODS_ACTIVE, ['giftcards'])
      expect(tabs).not.toContain('giftCards')
    })
  })
})
