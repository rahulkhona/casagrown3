/**
 * CasaGrown Community Voice Service Worker — Push Notifications
 *
 * Handles push events for community voice users:
 *   - New post mentions
 *   - Staff replies
 *   - Status updates on submitted feedback
 */

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'CasaGrown Community'
  const tag = data.tag || 'casagrown-voice-notification'

  const options = {
    body: data.body || 'You have a new community update',
    icon: '/logo.png',
    badge: '/favicon.ico',
    tag,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

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
