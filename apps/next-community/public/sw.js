/**
 * CasaGrown Service Worker — Push Notifications
 *
 * Handles:
 *   - push events: display browser notifications (with suppress-when-active)
 *   - notificationclick: focus/open CasaGrown tab
 *   - message: receive active conversation ID from the page
 *   - pushsubscriptionchange: re-register token (future)
 */

// Track which conversation the user is currently viewing
let activeConversationId = null

// Receive messages from the page (e.g. "user opened chat X")
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_ACTIVE_CHAT') {
    activeConversationId = event.data.conversationId || null
  }
})

// Show notification when a push event arrives
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'CasaGrown'
  const tag = data.tag || 'casagrown-notification'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if any CasaGrown window is focused
        const hasFocusedClient = windowClients.some(
          (client) =>
            client.url.includes(self.location.origin) &&
            client.visibilityState === 'visible' &&
            client.focused
        )

        // If user is actively using the app AND the notification is for
        // the conversation they're viewing, suppress it completely
        if (hasFocusedClient && tag.startsWith('chat-')) {
          const chatConvId = tag.replace('chat-', '')
          if (chatConvId === activeConversationId) {
            console.log('[SW] Suppressed notification — user viewing this conversation')
            return
          }
        }

        // If user has a focused CasaGrown tab, postMessage to trigger an in-app toast
        if (hasFocusedClient) {
          windowClients.forEach(client => {
            if (client.url.includes(self.location.origin) && client.visibilityState === 'visible' && client.focused) {
              client.postMessage({
                type: 'PUSH_NOTIFICATION',
                data: { title, body: data.body, url: data.url }
              })
            }
          })
          return // Skip OS notification since we sent it in-app
        }

        // Keep OS notification for background/inactive states
        const options = {
          body: data.body || 'You have a new update',
          icon: '/logo.png',
          badge: '/favicon.ico',
          tag,
          data: { url: data.url || '/feed' },
        }

        return self.registration.showNotification(title, options)
      })
  )
})

// Handle notification click — open/focus CasaGrown
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/feed'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If CasaGrown is already open, focus it
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

// Handle subscription changes (token rotation)
self.addEventListener('pushsubscriptionchange', (event) => {
  // TODO: Re-register subscription with backend
  // This happens when the browser rotates the push token
  console.log('[SW] Push subscription changed — token re-registration needed')
})

