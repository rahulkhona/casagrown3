/**
 * CasaGrown Market Service Worker — Push Notifications
 *
 * Handles:
 *   - push events: display browser notifications
 *   - notificationclick: focus/open CasaGrown Market tab
 */

// Show notification when a push event arrives
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'CasaGrown Market'
  const tag = data.tag || 'casagrown-market-notification'

  const options = {
    body: data.body || 'You have a new update',
    icon: '/logo.png',
    badge: '/favicon.ico',
    tag,
    data: { url: data.url || '/market' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Handle notification click — open/focus CasaGrown Market
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/market'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If CasaGrown Market is already open, focus it
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen)
            return client.focus()
          }
        }
        // Otherwise open a new tab
        return clients.openWindow(urlToOpen)
      })
  )
})
