# Developer Guide

Welcome to the **CasaGrown** monorepo! This guide covers everything you need to
set up, run, test, and contribute to the universal applications.

---

## Prerequisites

| Tool               | Version  | Notes                                  |
| :----------------- | :------- | :------------------------------------- |
| **Node.js**        | ≥ 20.9.0 | `node -v` to verify                    |
| **Yarn**           | 4.5.0    | Shipped via `packageManager` field     |
| **Supabase CLI**   | latest   | `npx supabase --version`               |
| **Docker**         | latest   | Required for local Supabase containers |
| **Xcode**          | latest   | iOS development only                   |
| **Android Studio** | latest   | Android development only               |

---

## 1. Installation

```bash
# Clone and install
git clone <repo-url> && cd casagrown3
yarn install          # also runs postinstall (patch-package + tamagui check)
```

---

## 2. Supabase Setup (Local)

The Supabase local environment is required for **all** development (web, iOS,
Android).

### Start the local Supabase stack

```bash
npx supabase start
```

This starts Postgres, Auth, Storage, Realtime, and Edge Functions locally. On
first run it pulls Docker images (~5 min).

### Get your local keys

```bash
npx supabase status
```

Output includes:

| Field                | Example                                                   | Used For                          |
| :------------------- | :-------------------------------------------------------- | :-------------------------------- |
| **API URL**          | `http://127.0.0.1:54321`                                  | `NEXT_PUBLIC_SUPABASE_URL`        |
| **Anon Key**         | `eyJhbGci...` (JWT)                                       | `NEXT_PUBLIC_SUPABASE_ANON_KEY`   |
| **Service Role Key** | `eyJhbGci...` (JWT)                                       | Server-side / Edge Functions only |
| **DB URL**           | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Direct DB access                  |

### Configure environment variables

Each app has its own `.env` file with Supabase credentials:

#### Web (Next.js) — `apps/next-community/.env`

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
NEXT_PUBLIC_PAYMENT_MODE=mock
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx  # Only for Stripe mode
```

#### Native (Expo) — `apps/expo-community/.env`

```env
# iOS Simulator uses localhost; Android Emulator uses 10.0.2.2
EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
EXPO_PUBLIC_PAYMENT_MODE=mock
# EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx  # Only for Stripe mode
```

> [!IMPORTANT]
> For **iOS Simulator**, change the URL to `http://127.0.0.1:54321`. For
> **physical devices**, use your machine's LAN IP (e.g.
> `http://192.168.1.X:54321`).

The Supabase client is initialized in `packages/app/utils/supabase.ts` and reads
from `NEXT_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` environment
variables at build time.

### Apply migrations & seed data

```bash
npx supabase db reset   # Drops, recreates, applies all migrations, and runs seed.sql
```

To apply only new migrations without resetting:

```bash
npx supabase migration up
```

### Stop Supabase

```bash
npx supabase stop       # Keeps data (containers stay)
npx supabase stop --no-backup  # Drops all data
```

---

## 3. Running the Applications

All convenience scripts are in the root `package.json`:

### Community App

| Platform    | Command        | Details                                               |
| :---------- | :------------- | :---------------------------------------------------- |
| **Web**     | `yarn web`     | Next.js dev server on `http://localhost:3000`         |
| **iOS**     | `yarn ios`     | Expo → iOS Simulator                                  |
| **Android** | `yarn android` | Expo → Android Emulator                               |
| **Metro**   | `yarn native`  | Expo Metro bundler (connect from Expo Go / dev build) |

### Admin App

| Platform    | Command              |
| :---------- | :------------------- |
| **Web**     | `yarn web:admin`     |
| **iOS**     | `yarn ios:admin`     |
| **Android** | `yarn android:admin` |

### Native development builds

```bash
yarn native:prebuild    # Generate native projects
cd apps/expo-community && yarn ios   # or yarn android
```

---

## 4. Monorepo Structure

```
casagrown3/
├── apps/
│   ├── expo-community/     # Expo app (community users)
│   ├── expo-admin/         # Expo app (admin/moderators)
│   ├── next-community/     # Next.js web app (community)
│   └── next-admin/         # Next.js web app (admin)
├── packages/
│   ├── app/                # Shared screens, services, hooks, utils
│   │   └── features/
│   │       ├── auth/       # Authentication (auth-hook, login)
│   │       ├── chat/       # Chat service, inbox, chat screen
│   │       ├── feed/       # Feed service, post cards
│   │       ├── create-post/# Post creation (shared shell + media components)
│   │       └── ...
│   ├── ui/                 # Shared Tamagui components
│   └── config/             # Tamagui / theme configuration
├── supabase/
│   ├── functions/
│   │   ├── _shared/        # Shared edge function utilities
│   │   │   ├── serve-with-cors.ts  # CORS + Supabase client + error wrapper
│   │   │   └── test-helpers.ts     # Integration test helpers
│   │   ├── create-order/   # Each function has index.ts + test.ts
│   │   └── ...
│   ├── migrations/         # SQL migrations (auto-applied in order)
│   ├── seed.sql            # Development seed data
│   └── config.toml         # Supabase project config
└── docs/                   # Documentation (this guide, data model, etc.)
```

---

## 5. Chat Architecture

The chat system uses **Supabase Realtime** for live messaging and presence. Key
files:

### Service Layer — `packages/app/features/chat/chat-service.ts`

| Function                     | Purpose                                                                       |
| :--------------------------- | :---------------------------------------------------------------------------- |
| `getOrCreateConversation`    | Find or create a conversation (handles duplicate-safe upsert)                 |
| `getConversationWithDetails` | Fetch conversation with post info and participant details                     |
| `getUserConversations`       | Inbox: list all conversations, sorted unread-first then by recency            |
| `getConversationMessages`    | Fetch messages with sender info and media URLs                                |
| `sendMessage`                | Send text/media/mixed/system messages                                         |
| `markMessagesAsDelivered`    | Mark incoming messages as delivered (single checkmark → double)               |
| `markMessagesAsRead`         | Mark incoming messages as read (grey checkmarks → blue)                       |
| `subscribeToMessages`        | Realtime subscription for new messages (INSERT events)                        |
| `subscribeToMessageUpdates`  | Realtime subscription for delivery/read status (UPDATE events)                |
| `createPresenceChannel`      | Per-conversation typing indicator via Broadcast (online status is root-level) |
| `getUnreadChatCount`         | Count distinct conversations with unread messages (for nav badge)             |

### Realtime Configuration

Chat messages are published to Supabase Realtime with `REPLICA IDENTITY FULL` so
that client-side filters (e.g. `conversation_id=eq.X`) work on UPDATE events.
See the `20260213010000_chat_realtime` migration.

#### Presence & Typing Architecture

Online status uses a **root-level, visibility-aware** presence provider:

- **`AppPresenceProvider`** — wraps the app tree once the user is authenticated.
  Manages a single Supabase presence channel scoped to the user's community
  (`app-presence:{communityH3}`).
- **Visibility-aware lifecycle:**
  - **Native** — `AppState` listener: subscribes on `active`, unsubscribes on
    `background`/`inactive`.
  - **Web** — `visibilitychange` listener: subscribes when `visible`,
    unsubscribes when `hidden`.
  - This prevents idle WebSocket connections when the app is not in use.
- **Consumer hooks:** `useIsOnline(userId)` returns whether a user is online;
  `useOnlineUsers()` returns the full set of online user IDs.

Per-conversation channels (`createPresenceChannel`) now **only handle typing**
via Supabase Broadcast events. Online/offline indicators in `ChatScreen` come
from the root-level `useIsOnline` hook.

**Points Balance Realtime** (`usePointsBalance`) also uses visibility-aware
connect/disconnect for its `postgres_changes` channel, with a 5-second periodic
poll (cross-platform) as a fallback.

### UI Components

| Component          | File                         | Purpose                                                             |
| :----------------- | :--------------------------- | :------------------------------------------------------------------ |
| `ChatInboxScreen`  | `ChatInboxScreen.tsx`        | Conversation list with unread indicators + live re-sort             |
| `ChatScreen`       | `ChatScreen.tsx`             | Full chat UI: post header, message bubbles, typing indicator, media |
| `ConversationCard` | Inside `ChatInboxScreen.tsx` | Individual conversation row with avatar, badge, unread dot          |

---

## 5.5 Payment Architecture

The payment system uses a **provider pattern** to swap between a mock provider
(development) and Stripe (production) via a single environment variable.

### Key Files

| File                      | Purpose                                                                |
| :------------------------ | :--------------------------------------------------------------------- |
| `paymentService.ts`       | Provider interface + factory (`createPaymentService`)                  |
| `mockPaymentService.ts`   | Mock provider: same server-side flow as Stripe, no real card charges   |
| `stripePaymentService.ts` | Stripe provider: creates real PaymentIntents (card UI needs finishing) |
| `usePaymentService.ts`    | React hook wrapping the active provider                                |
| `usePointsBalance.ts`     | Fetches user's current balance from `point_ledger`                     |
| `usePendingPayments.ts`   | Resolves stuck payments on app open                                    |
| `BuyPointsSheet.tsx`      | UI: point packages, card inputs, payment flow                          |
| `OrderSheet.tsx`          | UI: order form with inline Buy Points                                  |

### Provider Switching

```bash
# Development (default)
NEXT_PUBLIC_PAYMENT_MODE=mock       # or EXPO_PUBLIC_PAYMENT_MODE=mock

# Production
NEXT_PUBLIC_PAYMENT_MODE=stripe     # or EXPO_PUBLIC_PAYMENT_MODE=stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx  # or EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
```

### Edge Functions

All edge functions use a shared `serveWithCors` wrapper from
`supabase/functions/_shared/serve-with-cors.ts` which handles CORS, Supabase
client initialization, and error wrapping. Functions requiring auth use
`requireAuth`. Response helpers: `jsonOk`, `jsonError`.

| Function                   | Auth | Purpose                                             |
| :------------------------- | :--- | :-------------------------------------------------- |
| `create-payment-intent`    | Yes  | Creates `payment_transactions` row + Stripe PI      |
| `confirm-payment`          | No   | Idempotent point crediting (single source of truth) |
| `stripe-webhook`           | No   | Handles Stripe webhook events (signature verified)  |
| `resolve-pending-payments` | Yes  | Recovers stuck payments on app open                 |
| `create-order`             | Yes  | Atomic order: conversation + offer + order + ledger |
| `create-offer`             | Yes  | Atomic offer creation on buy posts (wraps RPC)      |
| `register-push-token`      | Yes  | Upsert push notification tokens/subscriptions       |
| `send-push-notification`   | Yes  | Send push to users via Web Push, APNs, or FCM       |
| `donate-points`            | Yes  | Donate points to GlobalGiving charitable projects   |
| `fetch-donation-projects`  | No   | Fetch/search GlobalGiving project catalog           |
| `fetch-gift-cards`         | No   | Merged Reloadly + Tremendous gift card catalog      |
| `redeem-gift-card`         | Yes  | Purchase gift card with points via provider APIs    |
| `sync-provider-balance`    | No   | Cron: monitor Reloadly/Tremendous balances          |
| `assign-experiment`        | No   | Deterministic A/B experiment assignment             |
| `resolve-community`        | No   | Resolves H3 community from lat/lng or address       |
| `enrich-communities`       | No   | Background enrichment of community metadata         |
| `sync-locations`           | No   | Syncs country reference data from REST Countries    |
| `pair-delegation`          | Yes  | Delegated sales pairing (multi-action router)       |
| `update-zip-codes`         | No   | Batch zip code data processing                      |

```bash
# Serve locally
npx supabase functions serve

# Deploy all
npx supabase functions deploy
```

### Stripe Secrets (Edge Functions)

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### Redemption Provider Secrets (Edge Functions)

```bash
# Gift cards — Tremendous (preferred: no fees)
supabase secrets set TREMENDOUS_API_KEY=xxx

# Gift cards — Reloadly (fallback provider)
supabase secrets set RELOADLY_CLIENT_ID=xxx
supabase secrets set RELOADLY_CLIENT_SECRET=xxx
supabase secrets set RELOADLY_SANDBOX=true         # Set to "false" for production

# Charitable donations — GlobalGiving
supabase secrets set GLOBALGIVING_API_KEY=xxx
supabase secrets set GLOBALGIVING_SANDBOX=true      # Set to "false" for production
```

### API Provider Funding & Wallets

For redemptions and donations to work without failing, the respective API
platforms must have funds available:

**Tremendous**:

- **Method**: Wallet Balance or direct ACH.
- **Details**: You can pre-fund your Tremendous account via wire, ACH, or credit
  card from their dashboard. Alternatively, Tremendous supports "pay-by-bank"
  (ACH) for API orders without needing a pre-funded balance, though you must ask
  their support team to enable this feature for your API key.

**Reloadly**:

- **Method**: Wallet Balance ONLY.
- **Details**: Reloadly strictly requires you to maintain a pre-funded wallet
  balance. You can top this up via ACH, Wire, Credit Card, or Crypto from the
  Reloadly dashboard. The API will draw down exclusively from this stored
  balance.

**GlobalGiving**:

- **Method**: Wallet Balance / API Account Funding.
- **Details**: Similar to Reloadly, the GlobalGiving API does not natively
  expose endpoints to draw directly from an external ACH account
  per-transaction. You must pre-fund your developer account balance through
  GlobalGiving support or their payment portal.

> **Note on Failures**: CasaGrown handles provider exhaustion elegantly! If a
> user redeems a gift card or donates points but the respective API wallet is
> empty, the Edge Function will _not_ refund their points or crash. Instead, it
> swallows the error, marks the redemption as `queued`, and fires a push
> notification to the user letting them know their transaction is pending. The
> `retry-redemptions` cron job (`supabase/functions/retry-redemptions`) will
> automatically sweep and fullfil these once you top up your API wallets!

> [!NOTE]
> All edge function secrets are injected at runtime via `Deno.env.get()`. The
> shared `serveWithCors` wrapper provides an `env()` helper that reads from
> `Deno.env`. For local development, set these in `supabase/.env.local` or pass
> them via `supabase functions serve --env-file supabase/.env.local`.

---

## 5.7 Push Notification Architecture

Push notifications use a **credential-gated feature flag** pattern — all code is
in place, but each platform only activates when its credentials are provided.

> **Read the full architectural design decisions and payloads in
> [`docs/notifications_design.md`](notifications_design.md).**

### How It Works

```mermaid
flowchart LR
    A[User taps Buy/Offer/Chat/Post] --> B{shouldShowPrompt?}
    B -->|Session guard / cooldown / opt-out| C[Skip]
    B -->|Yes| D[Show Modal Variant]
    D -->|Desktop/PWA| E[Browser Notification.requestPermission]
    D -->|iOS Safari/Chrome| F[PWA Install Guide]
    D -->|Permission denied| G[Settings Guide]
    E -->|Granted| H[Subscribe → register-push-token]
```

### Key Files

| File                                                        | Purpose                                                                      |
| :---------------------------------------------------------- | :--------------------------------------------------------------------------- |
| `features/notifications/notification-storage.ts`            | Prompt state persistence (session guard, 7-day cooldown, permanent opt-out)  |
| `features/notifications/notification-service.ts`            | Platform detection, permission APIs, token registration                      |
| `features/notifications/NotificationPromptModal.tsx`        | 4-variant Tamagui modal (first-time, denied, iOS Safari PWA, iOS Chrome PWA) |
| `features/notifications/useNotificationPrompt.ts`           | Hook: `showPrompt()` + `modalProps`                                          |
| `apps/next-community/public/manifest.json`                  | PWA manifest for iOS Home Screen install                                     |
| `apps/next-community/public/sw.js`                          | Service worker for push event handling                                       |
| `supabase/migrations/20260225000000_push_subscriptions.sql` | Push token storage table                                                     |
| `supabase/functions/register-push-token/index.ts`           | Token upsert edge function                                                   |
| `supabase/functions/send-push-notification/index.ts`        | Send notifications (Web Push + APNs + FCM)                                   |

### Feature Flags (Credential-Gated)

Each platform activates automatically when its credentials are set. **No code
changes required** — just provide the keys.

| Platform          | Feature Flag (Credential)                                       | Status                 |
| :---------------- | :-------------------------------------------------------------- | :--------------------- |
| **Web Push**      | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in `.env.local`                  | ✅ Active              |
| **iOS (APNs)**    | `APNS_KEY_ID` + `APNS_TEAM_ID` + `APNS_KEY` in Supabase secrets | ⏭️ Waiting for keys    |
| **Android (FCM)** | `FCM_SERVER_KEY` in Supabase secrets                            | ⏭️ Waiting for keys    |
| **Native client** | `expo-notifications` package installed                          | ⏭️ Waiting for install |

### Enabling Web Push (Already Done)

VAPID keys have been generated and saved:

- `apps/next-community/.env.local` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `supabase/.env.local` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`

### Enabling iOS Push

1. **Get APNs key** from
   [Apple Developer Portal → Keys](https://developer.apple.com/account/resources/authkeys/list)
   - Click **+** → name it "CasaGrown Push Key"
   - Enable **Apple Push Notifications service (APNs)**
   - Download the `.p8` file (Apple only lets you download once!)
   - Note the **Key ID** and your **Team ID** (top-right of portal)
2. **Set credentials** (local dev):
   ```bash
   # Add to supabase/.env.local
   APNS_KEY_ID=<your-key-id>
   APNS_TEAM_ID=<your-team-id>
   APNS_KEY=<paste-contents-of-.p8-file>
   ```
3. **Install expo-notifications**:
   ```bash
   cd apps/expo-community
   npx expo install expo-notifications
   npx expo prebuild --clean
   npx expo run:ios
   ```
4. The code in `notification-service.ts` → `enableIOSPush()` and
   `send-push-notification` → `sendAPNs()` will activate automatically.

### Enabling Android Push

1. **Create Firebase project** at
   [console.firebase.google.com](https://console.firebase.google.com/)
   - Project Settings → **Add Android app** → package: `dev.casagrown.community`
   - Download `google-services.json` → place in `apps/expo-community/`
   - Project Settings → **Cloud Messaging** → copy **Server Key**
2. **Set credentials** (local dev):
   ```bash
   # Add to supabase/.env.local
   FCM_SERVER_KEY=<your-server-key>
   ```
3. **Install expo-notifications** (same as iOS if not done):
   ```bash
   cd apps/expo-community
   npx expo install expo-notifications
   npx expo prebuild --clean
   npx expo run:android
   ```
4. The code in `notification-service.ts` → `enableAndroidPush()` and
   `send-push-notification` → `sendFCM()` will activate automatically.

### Prompt Dismissal Behavior

| User Action                                  | Behavior                                            |
| :------------------------------------------- | :-------------------------------------------------- |
| Taps "Enable Notifications"                  | Requests browser/native permission, registers token |
| Taps "Not now"                               | Dismisses for this session + 7-day cooldown         |
| Taps "No thanks, I don't need notifications" | Permanent opt-out (never shows again)               |
| Closes modal                                 | Same as "Not now"                                   |

---

## 6. Testing

### Running Tests

```bash
# All app unit tests (28 suites, 368 tests)
yarn workspace @casagrown/app jest

# Single file
yarn workspace @casagrown/app jest packages/app/features/chat/chat-service.test.ts

# Watch mode
yarn workspace @casagrown/app jest --watch

# Edge function integration tests (8 suites, 29 tests)
# Requires: npx supabase functions serve (running in another terminal)
deno test --allow-net --allow-env supabase/functions/*/test.ts

# Web integration tests (Playwright)
cd apps/next-community && npx playwright test

# Mobile E2E tests (Maestro — 13 flows, iOS + Android)
# Requires: app running on iOS Simulator or Android Emulator
./e2e/seed-test-data.sh            # Reset DB + clear Mailpit
maestro test --udid <UDID> e2e/maestro/   # iOS (use xcrun simctl list)
maestro test --device emulator-5554 e2e/maestro/  # Android
maestro test e2e/maestro/flows/login.yaml  # Run a single flow

# Root-level tests (Vitest)
yarn test
```

### Test coverage by feature

| Feature                     | Test File                                               |  Tests |
| :-------------------------- | :------------------------------------------------------ | -----: |
| Chat service                | `chat-service.test.ts`                                  |     24 |
| Chat inbox UI               | `ChatInboxScreen.test.tsx`                              |     11 |
| Chat helpers                | `ChatScreen.test.tsx`                                   |     13 |
| Feed service                | `feed-service.test.ts`                                  |     13 |
| Feed screen                 | `feed-screen.test.tsx`                                  |     17 |
| Post creation               | `create-post-screen.test.tsx`, `post-service.test.ts`   | varies |
| Shared post comps           | `MediaPickerSection.test.tsx`, `PostFormShell.test.tsx` |     46 |
| Profile wizard              | `wizard-context.test.tsx`, step tests                   | varies |
| Delegations                 | `useDelegations.test.ts`, `delegate-screen.test.tsx`    | varies |
| Edge: confirm-payment       | `supabase/functions/confirm-payment/test.ts`            |      4 |
| Edge: create-payment-intent | `supabase/functions/create-payment-intent/test.ts`      |      5 |
| Edge: create-order          | `supabase/functions/create-order/test.ts`               |      4 |
| Edge: resolve-pending       | `supabase/functions/resolve-pending-payments/test.ts`   |      4 |
| Edge: resolve-community     | `supabase/functions/resolve-community/test.ts`          |      4 |
| Edge: assign-experiment     | `supabase/functions/assign-experiment/test.ts`          |      3 |
| Edge: enrich-communities    | `supabase/functions/enrich-communities/test.ts`         |      3 |
| Edge: sync-locations        | `supabase/functions/sync-locations/test.ts`             |      2 |
| Notification storage        | `notification-storage.test.ts`                          |     13 |
| Notification service        | `notification-service.test.ts`                          |     19 |
| Notification hook           | `useNotificationPrompt.test.ts`                         |      9 |

### Git Hooks (Husky)

| Hook           | What it does                                                               |
| :------------- | :------------------------------------------------------------------------- |
| **pre-commit** | Runs `lint-staged` → `jest --findRelatedTests` on changed `.ts/.tsx` files |
| **pre-push**   | Runs the full Jest test suite with `--bail` (fails fast on first error)    |

---

## 7. Database

### Viewing the schema

Full schema documentation: [`docs/data_model.md`](data_model.md)

### Creating a new migration

```bash
npx supabase migration new <descriptive_name>
# Edit the generated SQL file in supabase/migrations/
npx supabase db reset    # Apply and test
```

### Key conventions

- **RLS on all tables** — every table has Row Level Security policies
- **Timestamps** — use `timestamptz` with `DEFAULT now()` for `created_at`
- **UUIDs** — all primary keys are `uuid DEFAULT gen_random_uuid()`
- **Foreign keys** — named `table_column_fkey` for Supabase relationship
  inference

---

## 8. Deployment

### Web (Vercel)

```bash
yarn web:prod           # Build Next.js production bundle
yarn web:prod:serve     # Serve locally to test
```

### Supabase (Production)

```bash
npx supabase link --project-ref <project-id>
npx supabase db push    # Apply pending migrations to remote
npx supabase functions deploy  # Deploy edge functions
```

### Required Environment Variables — Full Reference

#### Client-Side (App `.env` Files)

| Variable                             | Platform | Required    | Purpose                      |
| :----------------------------------- | :------- | :---------- | :--------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`           | Web      | Yes         | Supabase API endpoint        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Web      | Yes         | Supabase anonymous JWT       |
| `NEXT_PUBLIC_PAYMENT_MODE`           | Web      | No          | `mock` (default) or `stripe` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Web      | Stripe only | Stripe publishable key       |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`       | Web      | Push only   | Web Push VAPID public key    |
| `EXPO_PUBLIC_SUPABASE_URL`           | Native   | Yes         | Supabase API endpoint        |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`      | Native   | Yes         | Supabase anonymous JWT       |
| `EXPO_PUBLIC_PAYMENT_MODE`           | Native   | No          | `mock` (default) or `stripe` |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Native   | Stripe only | Stripe publishable key       |

#### Server-Side (Supabase Secrets — `supabase secrets set`)

| Secret                      | Required     | Purpose                              |
| :-------------------------- | :----------- | :----------------------------------- |
| `SUPABASE_URL`              | Auto         | Injected automatically by Supabase   |
| `SUPABASE_ANON_KEY`         | Auto         | Injected automatically by Supabase   |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto         | Injected automatically by Supabase   |
| `STRIPE_SECRET_KEY`         | Stripe mode  | Stripe API secret key                |
| `STRIPE_WEBHOOK_SECRET`     | Stripe mode  | Stripe webhook signing secret        |
| `TREMENDOUS_API_KEY`        | Redemptions  | Gift card provider (preferred: free) |
| `RELOADLY_CLIENT_ID`        | Redemptions  | Gift card provider (fallback)        |
| `RELOADLY_CLIENT_SECRET`    | Redemptions  | Gift card provider (fallback)        |
| `RELOADLY_SANDBOX`          | Redemptions  | `true` for sandbox, `false` for prod |
| `GLOBALGIVING_API_KEY`      | Donations    | Charitable donation API              |
| `GLOBALGIVING_SANDBOX`      | Donations    | `true` for sandbox, `false` for prod |
| `VAPID_PUBLIC_KEY`          | Push notifs  | Web Push VAPID public key            |
| `VAPID_PRIVATE_KEY`         | Push notifs  | Web Push VAPID private key           |
| `VAPID_SUBJECT`             | Push notifs  | VAPID contact (mailto: URL)          |
| `APNS_KEY_ID`               | Push (iOS)   | APNs key ID from Apple portal        |
| `APNS_TEAM_ID`              | Push (iOS)   | Apple Developer Team ID              |
| `APNS_KEY`                  | Push (iOS)   | Contents of .p8 file from Apple      |
| `FCM_SERVER_KEY`            | Push (Droid) | Firebase Cloud Messaging server key  |

---

## Common Issues

| Issue                                | Solution                                                                    |
| :----------------------------------- | :-------------------------------------------------------------------------- |
| `expo-secure-store` errors in tests  | Add `jest.mock('../auth/auth-hook')` or `jest.mock('../chat/chat-service')` |
| Android can't reach Supabase         | Use `http://10.0.2.2:54321` (not `localhost`)                               |
| iOS Simulator can't reach Supabase   | Use `http://127.0.0.1:54321`                                                |
| Physical device can't reach Supabase | Use LAN IP (e.g. `http://192.168.1.X:54321`)                                |
| Stale snapshots after UI changes     | Run `jest -u` to update snapshots                                           |
| Supabase containers not starting     | Run `docker system prune` then `npx supabase start`                         |
| Migration conflicts                  | Run `npx supabase db reset` to reapply from scratch                         |
| Edge functions returning non-2xx     | Run `./scripts/db-start.sh` — edge runtime may have stopped                 |
| StorageAPI errors on profile setup   | Run `supabase stop && supabase start` — imgproxy service may be stopped     |

---

## Quick Start Script

Use the all-in-one startup script to start Supabase, edge functions, and verify
all services are healthy:

```bash
./scripts/db-start.sh
```

This script:

1. Starts Supabase (or restarts if any services like imgproxy/edge runtime are
   stopped)
2. Starts edge functions in the background (`supabase functions serve`)
3. Runs health checks on: REST API, Auth, Storage, Buckets, Edge Functions,
   Database, Studio, Mailpit
4. Reports a green/red summary

Edge function logs are written to `/tmp/supabase-functions.log`.

> [!IMPORTANT]
> After applying new migrations (`supabase db reset`), always run
> `./scripts/db-start.sh` to restart edge functions and verify everything is up.
