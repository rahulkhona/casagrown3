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
```

#### Native (Expo) — `apps/expo-community/.env`

```env
# iOS Simulator uses localhost; Android Emulator uses 10.0.2.2
NEXT_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
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
│   │       ├── create-post/# Post creation flow
│   │       └── ...
│   ├── ui/                 # Shared Tamagui components
│   └── config/             # Tamagui / theme configuration
├── supabase/
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

| Function                     | Purpose                                                            |
| :--------------------------- | :----------------------------------------------------------------- |
| `getOrCreateConversation`    | Find or create a conversation (handles duplicate-safe upsert)      |
| `getConversationWithDetails` | Fetch conversation with post info and participant details          |
| `getUserConversations`       | Inbox: list all conversations, sorted unread-first then by recency |
| `getConversationMessages`    | Fetch messages with sender info and media URLs                     |
| `sendMessage`                | Send text/media/mixed/system messages                              |
| `markMessagesAsDelivered`    | Mark incoming messages as delivered (single checkmark → double)    |
| `markMessagesAsRead`         | Mark incoming messages as read (grey checkmarks → blue)            |
| `subscribeToMessages`        | Realtime subscription for new messages (INSERT events)             |
| `subscribeToMessageUpdates`  | Realtime subscription for delivery/read status (UPDATE events)     |
| `createPresenceChannel`      | Online/typing presence via Supabase Presence                       |
| `getUnreadChatCount`         | Count distinct conversations with unread messages (for nav badge)  |

### Realtime Configuration

Chat messages are published to Supabase Realtime with `REPLICA IDENTITY FULL` so
that client-side filters (e.g. `conversation_id=eq.X`) work on UPDATE events.
See the `20260213010000_chat_realtime` migration.

### UI Components

| Component          | File                         | Purpose                                                             |
| :----------------- | :--------------------------- | :------------------------------------------------------------------ |
| `ChatInboxScreen`  | `ChatInboxScreen.tsx`        | Conversation list with unread indicators + live re-sort             |
| `ChatScreen`       | `ChatScreen.tsx`             | Full chat UI: post header, message bubbles, typing indicator, media |
| `ConversationCard` | Inside `ChatInboxScreen.tsx` | Individual conversation row with avatar, badge, unread dot          |

---

## 6. Testing

### Running Tests

```bash
# All app unit tests (23 suites, 299 tests)
yarn workspace @casagrown/app jest

# Single file
yarn workspace @casagrown/app jest packages/app/features/chat/chat-service.test.ts

# Watch mode
yarn workspace @casagrown/app jest --watch

# Web integration tests (Playwright)
cd apps/next-community && npx playwright test

# Root-level tests (Vitest)
yarn test
```

### Test coverage by feature

| Feature        | Test File                                             |  Tests |
| :------------- | :---------------------------------------------------- | -----: |
| Chat service   | `chat-service.test.ts`                                |     24 |
| Chat inbox UI  | `ChatInboxScreen.test.tsx`                            |     11 |
| Chat helpers   | `ChatScreen.test.tsx`                                 |     13 |
| Feed service   | `feed-service.test.ts`                                |     13 |
| Feed screen    | `feed-screen.test.tsx`                                |     17 |
| Post creation  | `create-post-screen.test.tsx`, `post-service.test.ts` | varies |
| Profile wizard | `wizard-context.test.tsx`, step tests                 | varies |
| Delegations    | `useDelegations.test.ts`, `delegate-screen.test.tsx`  | varies |

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
