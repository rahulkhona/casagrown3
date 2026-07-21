import { getBaseAppUrl } from './external-urls'

describe('QR Code URL Payload Generation & Validation', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.SITE_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.EXPO_PUBLIC_APP_URL
  })

  test('generates valid Pickup Pass URL payload', () => {
    const baseUrl = getBaseAppUrl()
    const orderId = 'ord-987654321'
    const passcode = 'APPLES99'
    const qrUrl = `${baseUrl}/orders/${orderId}/pickup?passcode=${passcode}`

    expect(() => new URL(qrUrl)).not.toThrow()
    const parsed = new URL(qrUrl)
    expect(parsed.pathname).toBe('/orders/ord-987654321/pickup')
    expect(parsed.searchParams.get('passcode')).toBe('APPLES99')
  })

  test('generates valid Booth Helper Invite URL payload', () => {
    const baseUrl = getBaseAppUrl()
    const code = 'BOOTHS-7890'
    const qrUrl = `${baseUrl}/join-booth/${code}`

    expect(() => new URL(qrUrl)).not.toThrow()
    const parsed = new URL(qrUrl)
    expect(parsed.pathname).toBe('/join-booth/BOOTHS-7890')
  })

  test('generates valid Profile & Follow Referral URL payload', () => {
    const baseUrl = getBaseAppUrl()
    const username = 'sarah_gardens'
    const userId = 'usr_sarah_100'
    const qrUrl = `${baseUrl}/u/${username}?ref=${userId}&intent=follow`

    expect(() => new URL(qrUrl)).not.toThrow()
    const parsed = new URL(qrUrl)
    expect(parsed.pathname).toBe('/u/sarah_gardens')
    expect(parsed.searchParams.get('ref')).toBe('usr_sarah_100')
    expect(parsed.searchParams.get('intent')).toBe('follow')
  })

  test('respects NEXT_PUBLIC_SITE_URL and SITE_URL environment variables', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://supabase-configured-site.casagrown.com'
    const baseUrl = getBaseAppUrl()
    expect(baseUrl).toBe('https://supabase-configured-site.casagrown.com')

    const qrUrl = `${baseUrl}/u/testuser?ref=123`
    const parsed = new URL(qrUrl)
    expect(parsed.hostname).toBe('supabase-configured-site.casagrown.com')
  })
})
