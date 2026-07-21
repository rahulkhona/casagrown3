import { setPendingIntent, getPendingIntent, clearPendingIntent } from './pending-intent'

describe('pending-intent utility', () => {
  let store: Record<string, string> = {}

  beforeEach(() => {
    store = {}
    const localStorageMock = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { store = {} }
    }
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    })
  })

  test('sets and gets pending follow intent correctly', () => {
    setPendingIntent({ type: 'follow', targetId: 'usr_123', referrerId: 'ref_999' })
    const intent = getPendingIntent()
    expect(intent).not.toBeNull()
    expect(intent?.type).toBe('follow')
    expect(intent?.targetId).toBe('usr_123')
    expect(intent?.referrerId).toBe('ref_999')
  })

  test('clears pending intent', () => {
    setPendingIntent({ type: 'accept_booth', code: 'BOOTHS-789' })
    expect(getPendingIntent()).not.toBeNull()
    clearPendingIntent()
    expect(getPendingIntent()).toBeNull()
  })

  test('expires pending intents older than 24 hours', () => {
    const pastTime = Date.now() - (25 * 60 * 60 * 1000)
    store['cg_pending_intent'] = JSON.stringify({
      type: 'follow',
      targetId: 'usr_old',
      createdAt: pastTime
    })
    expect(getPendingIntent()).toBeNull()
  })
})
