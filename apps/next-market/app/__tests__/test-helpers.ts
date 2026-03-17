/**
 * Shared mock factories for page-level unit tests.
 * All market app pages use the same patterns:
 *   - createClient() from lib/supabase
 *   - useAuth() from lib/useAuth
 *   - useRouter/usePathname/useSearchParams from next/navigation
 *   - useMarket() from lib/store
 *   - CSS modules (auto-handled by vitest)
 */
import { vi } from 'vitest'

// ── Deep Supabase chain mock ─────────────────────────────────────────────
export function createMockChain(resolvedValue: any = { data: null, error: null }) {
  const chain: any = {}
  const methods = [
    'select', 'eq', 'neq', 'single', 'maybeSingle', 'limit', 'is', 'gt', 'lt',
    'gte', 'lte', 'in', 'insert', 'update', 'upsert', 'delete', 'match',
    'order', 'ascending', 'or', 'not', 'contains', 'like', 'ilike',
    'range', 'filter', 'textSearch', 'on',
  ]
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  // Terminal methods resolve
  chain.single.mockResolvedValue(resolvedValue)
  chain.maybeSingle.mockResolvedValue(resolvedValue)
  chain.then = (_cb: any) => Promise.resolve(resolvedValue).then(_cb)
  // Make it thenable for await
  Object.defineProperty(chain, Symbol.toStringTag, { value: 'Promise' })
  return chain
}

export function createMockSupabase(overrides?: {
  fromData?: any
  rpcData?: any
  user?: any
  session?: any
}) {
  const chain = createMockChain({ data: overrides?.fromData ?? null, error: null })
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn().mockResolvedValue({ data: overrides?.rpcData ?? null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: overrides?.user ?? null },
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: overrides?.session ?? null },
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: overrides?.user ?? null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    _chain: chain, // expose for assertions
  }
}

// ── Next.js navigation mock values ──────────────────────────────────────
export function createMockRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }
}

export function createMockSearchParams(params: Record<string, string> = {}) {
  const sp = new URLSearchParams(params)
  return {
    get: (k: string) => sp.get(k),
    has: (k: string) => sp.has(k),
    toString: () => sp.toString(),
    entries: () => sp.entries(),
    forEach: (cb: any) => sp.forEach(cb),
    getAll: (k: string) => sp.getAll(k),
    keys: () => sp.keys(),
    values: () => sp.values(),
    [Symbol.iterator]: () => sp[Symbol.iterator](),
    size: sp.size,
    append: vi.fn(),
    delete: vi.fn(),
    set: vi.fn(),
    sort: vi.fn(),
  }
}
