/**
 * CasaGrown Market Service Worker — Push Notifications
 *
 * Handles:
 *   - push events: display browser notifications
 *   - notificationclick: focus/open CasaGrown Market tab
 */

if (typeof self !== 'undefined' && typeof self.importScripts === 'function') {
  self.importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');
}

if (typeof workbox !== 'undefined' && workbox) {
  workbox.routing.registerRoute(
    ({url}) => url.origin.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/'),
    new workbox.strategies.CacheFirst({
      cacheName: 'supabase-image-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
        }),
      ],
    })
  );
} else {
  console.log('[SW] Workbox could not be loaded. No caching available.');
}

// Show notification when a push event arrives
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'CasaGrown Market'
  const tag = data.tag || 'casagrown-market-notification'

  // Headlessly synchronize the App Badge! 
  // Calling setAppBadge with no parameters natively instructs the OS to draw a generic 'Dot' indicator.
  if ('setAppBadge' in navigator) {
    navigator.setAppBadge().catch(() => {})
  }

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
