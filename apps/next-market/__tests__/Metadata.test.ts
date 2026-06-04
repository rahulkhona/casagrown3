import { describe, it, expect, vi } from 'vitest'
import { generateMetadata as generateBoothMetadata } from '../app/(main)/market/booth/[id]/page'
import { generateMetadata as generateProductMetadata } from '../app/(main)/market/booth/[id]/product/[productId]/page'

const mockCreateClient = vi.fn(() => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: null, error: new Error('not found') })
      })
    })
  })
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => mockCreateClient(url, key)
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (url: string, key: string) => mockCreateClient(url, key)
}))

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve({
    get: () => 'localhost:3002'
  }),
  cookies: () => Promise.resolve({
    getAll: () => [],
    get: () => null,
  })
}))

describe('Metadata Env Precedence', () => {
  it('prioritizes server-side environment variables in Booth page', async () => {
    mockCreateClient.mockClear()
    process.env.SUPABASE_URL = 'https://server-db.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.SUPABASE_ANON_KEY = 'server-key'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'local-key'

    try {
      await generateBoothMetadata({ params: Promise.resolve({ id: 'some-booth' }) })
    } catch (e) {}

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://server-db.supabase.co',
      'server-key'
    )
  })

  it('prioritizes server-side environment variables in Product page', async () => {
    mockCreateClient.mockClear()
    process.env.SUPABASE_URL = 'https://server-db.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.SUPABASE_ANON_KEY = 'server-key'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'local-key'

    try {
      await generateProductMetadata({ params: Promise.resolve({ id: 'some-booth', productId: 'some-prod' }) })
    } catch (e) {}

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://server-db.supabase.co',
      'server-key'
    )
  })
})
