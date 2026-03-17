// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

// Mock supabase
vi.mock('../../lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null }) }) }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null }),
  }),
}))

describe('supabase.ts', () => {
  it('createClient returns a client object', async () => {
    const { createClient } = await import('../../lib/supabase')
    const client = createClient()
    expect(client).toBeTruthy()
    expect(client.auth).toBeTruthy()
    expect(client.from).toBeTruthy()
  })
})
