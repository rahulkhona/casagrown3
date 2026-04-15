/**
 * CasaGrown Admin Service Worker — Push Notifications
 *
 * Handles push events for admin staff notifications:
 *   - Settlement funds received
 *   - Dispute escalations
 *   - Moderation alerts
 */

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'CasaGrown Admin'
  const tag = data.tag || 'casagrown-admin-notification'

  const options = {
    body: data.body || 'You have a new admin alert',
    icon: '/logo.png',
    badge: '/favicon.ico',
    tag,
    data: { url: data.url || '/dashboard' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen)
            return client.focus()
          }
        }
        return clients.openWindow(urlToOpen)
      })
  )
})
