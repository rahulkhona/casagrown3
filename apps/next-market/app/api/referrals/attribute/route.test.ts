import { vi } from 'vitest'
import { GET } from './route'

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (key: string) => {
      if (key === 'cg_ref') return { value: 'usr_ref_100' }
      if (key === 'cg_intent') return { value: JSON.stringify({ type: 'follow', target: 'sarah' }) }
      return null
    },
  }),
}))

describe('Referral Attribution API', () => {
  test('returns referral cookie and intent correctly', async () => {
    const req = new Request('http://localhost:3000/api/referrals/attribute')
    const res = await GET(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.referrerId).toBe('usr_ref_100')
    expect(json.intent?.type).toBe('follow')
    expect(json.intent?.target).toBe('sarah')
  })
})
