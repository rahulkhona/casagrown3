# Architecture Guidelines: Universal App (Tamagui + Solito)

This document outlines the architectural standards and development workflows for
the Casagrown universal applications (Community and Admin).

## Core Technology Stack

- **[Solito](https://solito.dev/)**: The bridge for universal navigation between
  React Navigation (Native) and Next.js (Web).
- **[Tamagui](https://tamagui.dev/)**: Styling system and UI component library
  for shared components between web and native.
- **[Expo](https://expo.dev/)**: Framework for Native iOS and Android
  development.
- **[Next.js](https://nextjs.org/)**: Framework for Web/Desktop development.
- **[Supabase](https://supabase.com/)**: Backend as a Service (Database, Auth,
  Edge Functions).

## Repository Structure (Monorepo)

To maximize code reuse, the project follows a monorepo structure:

```text
/apps
  /expo-community      # Entry point for Community mobile app
  /next-community      # Entry point for Community web app
  /expo-admin          # Entry point for Admin mobile app
  /next-admin          # Entry point for Admin web app
/packages
  /app                 # Shared features (Screens, Business Logic, Hooks)
  /ui                  # Shared Design System (Tamagui Config, Themes, Atomic UI)
/supabase              # Backend (Migrations, Edge Functions)
```

## Development Guidelines

### 1. Writing Universal Components

- Always use **Tamagui** components (`Stack`, `Text`, `Button`, etc.) instead of
  standard `div` or `View`.
- Place reusable UI components in `packages/ui`.
- Screen-level components belong in `packages/app/features`.

### 2. Universal Navigation

- Use Solito's `Link` and `useNavigate` to ensure navigation works as a standard
  router on web and React Navigation on mobile.
- Define routes in `packages/app/provider/navigation`.

### 3. Testing Standards

- **Unit Tests**: Use **Jest** with React/React Native Testing Library. Aim for
  high coverage on shared logic and `packages/ui`.
- **Integration (Web)**: Use **Playwright** for end-to-end flows on web.
- **Integration (Mobile)**: Use **Maestro** for mobile UI testing.

### 4. Form Validation

- Use **Zod** (`zod`) for all data validation schemas.
- Define schemas in a separate file (e.g., `schemas.ts`) to keep components
  clean.
- Share schemas between Frontend and Backend (Supabase Edge Functions) where
  possible.

## CI/CD and Local Workflow

### Local-First "Mock CD"

To maintain quality during local development before full cloud integration:

- **Fast Refresh**: Leverage HMR in both Next.js and Expo for instant UI
  feedback.

### Local Automated CI/CD (Pre-Commit)

To enforce quality standards automatically before code is shared:

- **Tooling**: We use **Husky** (git hooks) and **lint-staged**.
- **Workflow**:
  - On `git commit`, Husky triggers the pre-commit hook.
  - `lint-staged` identifies all _staged_ (modified) files.
  - **Actions**:
    - `packages/app/**/*.{ts,tsx}` -> Runs `jest --findRelatedTests` (Unit &
      Snapshot Tests).
    - (Future) `**/*.{ts,tsx}` -> Runs `tsc` (Type Check) and `eslint`.
- **Bypass**: In emergencies, use `git commit --no-verify`, but this is
  discouraged.

### Local Manual/Semi-Automated E2E (Pre-Push)

To ensure critical user flows work before pushing to the repository:

- **Tooling**: **Maestro** via Husky `pre-push` hook.
- **Workflow**:
  - On `git push`, the hook triggers.
  - **Action**: Runs `maestro test .maestro/home_screen_flow.yaml`.
- **Requirement**: The app must be running (Simulator/Emulator) for this to
  pass.
- **Bypass**: Use `git push --no-verify` if you are skipping E2E (e.g., purely
  documentation changes).

### Local-First "Mock CD"

- **Fast Refresh**: Leverage HMR in both Next.js and Expo for instant UI
  feedback.
- **Shadow Builds**: Periodically run `npm run build` to verify production
  bundling behavior.

### Cloud Orchestration (Future)

- **GitHub Actions**: Automated CI runners.
- **Vercel**: Automated Web deployments.
- **EAS (Expo Application Services)**: Remote Native builds and OTA updates.

---

## OTA Update Infrastructure

To ensure all mobile users receive the latest JavaScript bundle without
requiring App Store updates, we use **expo-updates** with a custom
`useOTAUpdates` hook.

### Implementation

**Hook**:
[`packages/app/hooks/useOTAUpdates.ts`](file:///Volumes/Seagate%20Portabl/development/casagrown3/packages/app/hooks/useOTAUpdates.ts)

**Wired into**: Root layout (`apps/expo-community/app/_layout.tsx`)

### Update Triggers

| Trigger                               | Interval                                | Coverage            |
| ------------------------------------- | --------------------------------------- | ------------------- |
| Cold app launch                       | Every launch                            | ~80% of users       |
| Foreground resume (AppState `active`) | On every background → active transition | ~15% more           |
| Periodic timer                        | Every 4 hours                           | Long-lived sessions |

### Safeguards

- **10-minute debounce** between update checks to avoid server load
- **Dev-mode no-op** (`__DEV__` guard) — disabled during development
- **Web platform guard** — skipped on web (not applicable)
- **Silent error handling** — network failures never disrupt user experience
- **Automatic reload** — downloads update, then reloads the app seamlessly

### Update Delivery Strategy

For backend migrations or critical fixes:

1. **OTA-eligible changes** (JS-only): Pushed via `expo-updates`. Users receive
   within 24-48 hours through foreground resume checks.
2. **Native changes** (new SDK, native modules): Require App Store submission +
   version gate enforcement.
3. **Version gate** (future): Add `min_app_version` check to API responses to
   force-reload outdated bundles.

---

## Scalability Roadmap

### Current Architecture (Phase 0)

Apps talk **directly to Supabase** via the JS client
(`supabase.from('table').select(...)`). Authorization is enforced via RLS
policies at the database level. This is appropriate for rapid iteration during
early development.

### Phase 1: Service Layer Abstraction (Next Priority)

Extract all Supabase queries into a centralized data access layer:

```text
packages/app/
  services/
    profile-service.ts      ← all profile CRUD
    community-service.ts    ← community resolution, membership
    feed-service.ts         ← posts, invites
    points-service.ts       ← ledger, rewards
    payment-service.ts      ← payment processing, Stripe integration
```

**Why**: Screens call `profileService.getReferralCode(userId)` instead of raw
Supabase queries. When backend changes, only service implementations change —
zero UI modifications.

**Effort**: Low. Refactor existing inline queries into service files. Payment
service already follows this pattern (`paymentService.ts` with provider
abstraction).

### Phase 2: API Server (When Triggered)

Introduce a dedicated API layer when any of these trigger points are reached:

- **Multi-database needs** (Redis for caching, Elasticsearch for search)
- **Complex cross-service mutations** (coordinating DB + email + notifications +
  points)
- **Third-party integrations** (payments, shipping, external APIs)
- **Rate limiting / abuse prevention** requiring a server-side chokepoint
- **Multiple client types** (partner API, admin dashboard, webhooks)

**Recommended stack**: Next.js API routes or standalone Hono/Express server
within the monorepo (`apps/api/`). Client services switch from direct Supabase
calls to HTTP calls behind the same interface.

### Phase 3: Multi-Database (When Needed)

With the API layer in place, additional data stores (Redis, Elasticsearch,
analytics DB) are added **behind** the API server. Client apps never interact
with these directly.

### Migration Strategy

Because the OTA update infrastructure is in place, backend migrations follow
this safe sequence:

1. Deploy new API server **alongside** existing Supabase access (both work)
2. Push OTA update swapping service implementations (Supabase → API)
3. Monitor for stragglers (2-4 weeks, keep Supabase running)
4. Deprecate direct Supabase client access

> **Key insight**: If the service layer (Phase 1) is pure JavaScript, the entire
> migration is OTA-eligible — no App Store review required.

### Why Not Supabase Edge Functions as the Full API Layer

Edge functions remain ideal for **specific operations** (e.g.,
`resolve-community`, `confirm-payment`, `create-order`), but are unsuitable as a
complete API layer due to cold starts (~200-500ms), per-function connection
pooling, limited shared middleware, and vendor lock-in to Deno runtime.
