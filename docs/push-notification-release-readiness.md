# Push Notification — Release Readiness

## ✅ Implemented (Web Push)

- Permission prompt UI with 4 modal variants (first-time, denied, iOS Safari
  PWA, iOS Chrome PWA)
- Prompt triggers: Buy, Offer, Chat, Create Post
- Persistence: session guard, 7-day cooldown ("Not now"), permanent opt-out ("No
  thanks")
- Service worker for push event handling
- PWA manifest for iOS Home Screen installation
- `push_subscriptions` table with RLS
- `register-push-token` edge function
- `send-push-notification` edge function (web only)

## 🔒 Pending: iOS Native Push

### Prerequisites

1. **Apple Developer Account** with appropriate role
2. **APNs Key** — go to
   [developer.apple.com → Keys](https://developer.apple.com/account/resources/authkeys/list)
   - Click **+** → name it "CasaGrown Push Key"
   - Enable **Apple Push Notifications service (APNs)**
   - Click **Continue** → **Register** → **Download** the `.p8` file
   - **Save securely** — Apple only lets you download once
   - Note your **Key ID** (shown after download) and **Team ID** (top-right of
     dev portal)
3. **Environment Variables** (add to Supabase):
   ```
   APNS_KEY_ID=<your-key-id>
   APNS_TEAM_ID=<your-team-id>
   APNS_KEY=<contents-of-.p8-file>
   ```
4. **Expo Setup**:
   ```bash
   npx expo install expo-notifications
   ```
   Add to `apps/expo-community/app.json`:
   ```json
   ["expo-notifications", {
      "icon": "./assets/icon_new.png",
      "color": "#16a34a"
   }]
   ```
5. **Rebuild native app**: `npx expo prebuild --clean && npx expo run:ios`

### Code to Uncomment

- `packages/app/features/notifications/notification-service.ts` →
  `enableIOSPush()`
- `supabase/functions/send-push-notification/index.ts` → iOS handling block

---

## 🔒 Pending: Android Native Push

### Prerequisites

1. **Firebase Project** — go to
   [console.firebase.google.com](https://console.firebase.google.com/)
   - Create new project or use existing
   - Go to **Project Settings → Cloud Messaging**
   - Get **Server Key** (or set up FCM v1 API with Service Account)
2. **Add Android App**:
   - Project Settings → General → **Add app** → Android
   - Package name: `dev.casagrown.community`
   - Download `google-services.json`
   - Place in `apps/expo-community/`
3. **Environment Variables** (add to Supabase):
   ```
   FCM_SERVER_KEY=<your-server-key>
   ```
4. **Expo Setup** (same as iOS):
   ```bash
   npx expo install expo-notifications
   ```
5. **Rebuild native app**: `npx expo prebuild --clean && npx expo run:android`

### Code to Uncomment

- `packages/app/features/notifications/notification-service.ts` →
  `enableAndroidPush()`
- `supabase/functions/send-push-notification/index.ts` → Android handling block

---

## VAPID Keys (Web Push)

VAPID keys have already been generated and stored locally:

- `apps/next-community/.env.local` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `supabase/.env.local` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`

---

## 🚀 Production Deployment Checklist

When deploying to a hosted Supabase project, follow these steps:

### 1. Link your project

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

Your project ref is in the Supabase dashboard URL:
`https://supabase.com/dashboard/project/<project-ref>`

### 2. Push the migration

```bash
supabase db push
```

This applies all pending migrations (including `push_subscriptions`) to the
remote database.

### 3. Set secrets on the remote project

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=BLRqq0KvgLwposLV83xYSlEfzySJdFfqNs1H0HwQvcVGAjCl4YB1Qc3b02YrEy9mE4tu347GlMmAq0CNC-NSAg8 \
  VAPID_PRIVATE_KEY=MdPM8nNJYBKB6FcvQgVl4JkIRfwpYPlebv-_UcIRKrw \
  VAPID_SUBJECT=mailto:support@casagrown.dev
```

### 4. Deploy edge functions

```bash
supabase functions deploy register-push-token
supabase functions deploy send-push-notification
```

### 5. Set Next.js production env

Add to your hosting platform (Vercel, etc.):

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BLRqq0KvgLwposLV83xYSlEfzySJdFfqNs1H0HwQvcVGAjCl4YB1Qc3b02YrEy9mE4tu347GlMmAq0CNC-NSAg8
```

### 6. iOS/Android (when ready)

Add platform-specific secrets:

```bash
# iOS
supabase secrets set APNS_KEY_ID=<key-id> APNS_TEAM_ID=<team-id> APNS_KEY=<p8-contents>

# Android
supabase secrets set FCM_SERVER_KEY=<server-key>
```
