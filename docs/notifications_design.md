# Notifications Architecture & Design

This document outlines the architecture for delivering real-time alerts and
native push notifications to CasaGrown users across Web, iOS, and Android.

## System Overview: The "Split-Brain" Delivery Architecture

CasaGrown uses a split-brain approach to deliver notifications to maximize
delivery speed and conserve device permissions:

1. **Foreground Realtime WebSockets**: Active users inside the CasaGrown app (or
   web) receive updates via Supabase Realtime using PostgreSQL changes over
   WebSockets. This bypasses OS notification permissions entirely, instantly
   delivering in-app toast banners.
2. **Background Push via Edge Functions**: When users are completely offline or
   have the app backgrounded, Supabase database triggers orchestrate an
   asynchronous HTTPS request to the `send-push-notification` Edge Function,
   which delivers an encrypted Webcrypto payload (Browser Push) or coordinates
   APNs/FCM delivery (Native).

## Push Notification Components

The Push Notification infrastructure consists of several key components:

### 1. `push_subscriptions` Database Table

Stores device registration tokens and endpoints.

- `platform`: `web`, `ios`, or `android`
- `token`: FCM token, APNs token, or Web Push stringified subscription
- `endpoint`: Required solely for Web Push to route the VAPID payload.

### 2. Frontend Registration Flow (`NotificationPromptModal.tsx`)

Because prompting for permission prematurely often results in a permanent
rejection, the apps enforce a "Warm-Up" pattern:

- The system evaluates a local `session` guard and a 7-day cooldown using
  `notification-storage.ts` before ever rendering a prompt.
- It displays a heavily styled Tamagui intercept modal explaining _why_
  CasaGrown needs notifications.
- If accepted, the browser `Notification.requestPermission` or Expo
  Notifications prompt executes.
- Upon success, the client sends a `POST` request to the `register-push-token`
  Edge Function.

### 3. Edge Function Delivery (`send-push-notification`)

The universal delivery engine processes requests formatted as:

```json
{
  "userId": "uuid",
  "title": "Notification Title",
  "body": "Detailed description here",
  "url": "/deeplink/path"
}
```

It dynamically queries the `push_subscriptions` table for the matching `user_id`
and fans out the payload:

#### Web Push (RFC-8292 Standard)

- Relies on AES128-GCM encryption natively through WebCrypto libraries.
- Requires ECDSA VAPID JWT generation to authenticate against the user's
  specific browser vendor (e.g. Mozilla/Google push service URLs).
- Uses the `web-push` NPM library to sign the VAPID payload and transmit the
  HTTPS `POST` event.
- Does _not_ require a feature flag to operate natively in production.

#### Mobile Push (APNs & FCM)

- Uses the Expo/Supabase integrations directly.
- **Environment-Gated:** Both iOS and Android Push capabilities are securely
  fenced behind the `ENABLE_MOBILE_PUSH` backend feature flag. During
  development, these are bypassed unless strict developer keys are injected.

## In-App Realtime Component

### `RealtimeNotificationListener.tsx`

A global context component instantiated at the Root App Layout level when a user
logs in. **Simplified in March 2026** to subscribe only to `notifications` table
`INSERT` events via Supabase Realtime. When a new notification row is inserted,
the listener triggers a toast via `useToastController().show(...)`.

Previous per-channel listeners (`messages`, `orders`, `delegations`) have been
replaced by a unified flow: backend triggers write to the `notifications` table,
and the single listener picks up all events.

### `useNotifications.ts` Hook

Central hook for managing notification state across web and mobile:

- **Fetches** the 50 most recent notifications on mount
- **Subscribes** to Realtime `INSERT` events and prepends new notifications
- **Provides** `markAsRead(id)`, `markAllAsRead()`, `clearAll()`
- **Exposes** `unreadNotificationsCount` for badge rendering

### `NotificationPanel.tsx`

Overlay panel triggered by the bell icon in `AppHeader.tsx` (web) and
`feed-screen.tsx` (mobile). Displays:

- Unread count badge on the bell icon
- Scrollable list of notifications with read/unread styling
- "Mark all as read" and "Clear all" action buttons
- Empty state when no notifications exist

## Setting Up Notifications (Production)

Refer to **5.7 Push Notification Architecture** in the
[Developer Guide](./developer_guide.md) for step-by-step key generation
instructions (VAPID, APNs, FCM) and local testing configurations.
