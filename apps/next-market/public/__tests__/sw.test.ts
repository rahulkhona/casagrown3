import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// Mock context types
type MockListeners = Record<string, (event: any) => void>

describe('Service Worker (sw.js)', () => {
  let mockListeners: MockListeners
  let mockNavigator: any
  let mockSelf: any
  let mockClients: any

  beforeEach(() => {
    mockListeners = {}
    
    // Core primitive mocks required for Service Workers
    mockSelf = {
      addEventListener: vi.fn((event, callback) => {
        mockListeners[event] = callback
      }),
      registration: {
        showNotification: vi.fn().mockResolvedValue(undefined)
      },
      location: { origin: 'http://localhost' }
    }
    
    // Natively mocked Badging API interactions
    mockNavigator = {
      setAppBadge: vi.fn().mockResolvedValue(undefined),
      clearAppBadge: vi.fn().mockResolvedValue(undefined)
    }
    
    mockClients = {
      matchAll: vi.fn().mockResolvedValue([]),
      openWindow: vi.fn().mockResolvedValue(undefined)
    }

    // Read and evaluate the raw pure JS Service Worker code inside our sandbox wrapper
    const swPath = path.resolve(__dirname, '../sw.js')
    const swCode = fs.readFileSync(swPath, 'utf-8')

    // System-level dependency injection natively overwriting global scope constraints!
    new Function('self', 'navigator', 'clients', swCode)(mockSelf, mockNavigator, mockClients)
  })

  // ════════════════════════════════════════
  // Push Notification Delivery Asserts
  // ════════════════════════════════════════
  describe('Push Events', () => {
    const triggerPush = (payload: any) => {
      const waitPromises: Promise<any>[] = []
      const mockEvent = {
        data: payload ? { json: () => payload } : null,
        waitUntil: (promise: Promise<any>) => waitPromises.push(promise)
      }
      
      if (mockListeners['push']) {
        mockListeners['push'](mockEvent)
      }
      return Promise.all(waitPromises)
    }

    it('shows notification securely with generic fallback when no payload is provided', async () => {
      await triggerPush(null)
      expect(mockSelf.registration.showNotification).toHaveBeenCalledWith('CasaGrown Market', expect.objectContaining({
        body: 'You have a new update',
      }))
      // A push event should natively invoke the 'Dot' logic securely
      expect(mockNavigator.setAppBadge).toHaveBeenCalledWith() 
    })

    it('syncs App Badge Dot strictly without parameters natively', async () => {
      await triggerPush({ message: 'Hello' })
      expect(mockNavigator.setAppBadge).toHaveBeenCalledWith()
      expect(mockNavigator.setAppBadge).toHaveBeenCalledTimes(1)
    })

    it('gracefully continues without thread-crashing if badging API is missing OS support', async () => {
      // Re-initialize isolated scope missing modern standard APIs (i.e., Firefox engine)
      const localNavigator = {} 
      const swCode = fs.readFileSync(path.resolve(__dirname, '../sw.js'), 'utf-8')
      new Function('self', 'navigator', 'clients', swCode)(mockSelf, localNavigator, mockClients)
      
      // Try to parse array without error
      await triggerPush({ unreadCount: 2 })
      expect(mockSelf.registration.showNotification).toHaveBeenCalled()
    })
  })

  // ════════════════════════════════════════
  // Intercept & Navigation Flow Asserts
  // ════════════════════════════════════════
  describe('Notification Click Events', () => {
    it('focuses an active client browser tab instead of brutally opening duplicates', async () => {
      // Mock an existing market user
      const mockClient = { 
        url: 'http://localhost/market', 
        navigate: vi.fn(),
        focus: vi.fn().mockResolvedValue(undefined) 
      }
      mockClients.matchAll.mockResolvedValue([mockClient])

      let waitPromise: any = null
      const mockEvent = {
        notification: { close: vi.fn(), data: { url: '/market' } },
        waitUntil: (promise: any) => { waitPromise = promise }
      }

      mockListeners['notificationclick'](mockEvent)
      await waitPromise

      expect(mockEvent.notification.close).toHaveBeenCalled()
      expect(mockClient.focus).toHaveBeenCalled()
      expect(mockClients.openWindow).not.toHaveBeenCalled()
    })

    it('opens native new tab instance flawlessly if CasaGrown was previously completely swiped/killed', async () => {
      mockClients.matchAll.mockResolvedValue([])

      let waitPromise: any = null
      const mockEvent = {
        notification: { close: vi.fn(), data: { url: '/feed' } },
        waitUntil: (promise: any) => { waitPromise = promise }
      }

      mockListeners['notificationclick'](mockEvent)
      await waitPromise

      expect(mockClients.openWindow).toHaveBeenCalledWith('/feed')
    })
  })
})
