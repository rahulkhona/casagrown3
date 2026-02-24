# Testing Strategy

## 1. Overview

This document outlines the testing strategy for the Casagrown universal app. The
goal is to ensure visual consistency, functional correctness (navigation,
localization, validation), and stability across updates.

## 2. Test Pyramid

### 2.1 Unit & Snapshot Tests (Jest)

**Scope**: `packages/app/features/**/*.test.tsx` **Tools**: `jest`,
`@testing-library/react-native`, `react-test-renderer`

These tests verify components in isolation. We mock external dependencies
(Navigation, i18n, icons) to focus on the component logic and rendering.

- **Snapshot Testing**:
  - **Purpose**: Regression testing. Ensures the UI structure (DOM/View
    hierarchy) does not change unexpectedly.
  - **Command**: `yarn workspace @casagrown/app jest`
  - **Update Snapshots**: `yarn workspace @casagrown/app jest -u`

- **Localization Verification**:
  - **Purpose**: Ensures all user-facing text uses translation keys
    (`t('home.title')`) instead of hardcoded strings.
  - **Method**: The mock i18n returns the key itself, so we assert
    `getByText('home.title')` exists.

- **Form Validation**:
  - **Purpose**: Verifies that input validation (Zod) triggers correct error
    states.
  - **Example**: `LoginScreen` tests ensure invalid emails display the localized
    error message.

### 2.2 Edge Function Integration Tests (Deno)

**Scope**: `supabase/functions/*/test.ts` **Tools**: `deno test`, shared helpers
in `supabase/functions/_shared/test-helpers.ts`

These tests run against a live local Supabase instance and verify CORS,
authentication enforcement, input validation, and business logic flows.

- **Shared Helpers** (`_shared/test-helpers.ts`):
  - `invokeFunction(name, body, headers)` — POST to edge function
  - `optionsPreflight(name)` — OPTIONS request for CORS verification
  - `authHeaders()` — sign up a random test user, returns auth headers
  - `serviceHeaders()` — returns service role key headers

- **To Run**:
  ```bash
  # Prerequisite: supabase functions serve running
  deno test --allow-net --allow-env supabase/functions/*/test.ts
  ```

### 2.3 Mobile E2E Tests (Maestro)

**Scope**: `e2e/maestro/flows/*.yaml` **Tools**:
[Maestro](https://maestro.mobile.dev/)

These tests run against the app on a real iOS Simulator or Android Emulator,
verifying end-to-end user flows.

#### Directory Structure

```
e2e/maestro/
├── config.yaml           # appId, env vars, ordered flow list (13 flows)
├── flows/
│   ├── login.yaml            # Full login + OTP verification
│   ├── feed-navigation.yaml  # Feed content, scroll, Menu tab items
│   ├── hamburger-menu.yaml   # Menu items, Profile nav, Transfer Points absence
│   ├── buy-points.yaml       # Menu → Buy Points → Stripe form
│   ├── create-post.yaml      # Create Post → Sell form
│   ├── order-flow.yaml       # Conditional: tap Order if visible
│   ├── orders.yaml           # Orders tab: tabs, filters, order cards
│   ├── offers.yaml           # Offers tab: tabs, filters
│   ├── chat.yaml             # Chats tab
│   ├── post-management.yaml  # Menu → My Posts
│   ├── delegation.yaml       # Menu → Delegate Sales
│   ├── profile-management.yaml  # Menu → Profile & Settings
│   └── profile-wizard.yaml   # Conditional: wizard if visible
└── utils/
    └── login.yaml            # Reusable login utility (used by all flows)
```

#### Test Users (from `seed.sql`)

| Role   | Email               | Password           |
| :----- | :------------------ | :----------------- |
| Seller | `seller@test.local` | `TestPassword123!` |
| Buyer  | `buyer@test.local`  | `TestPassword123!` |

#### Navigation Patterns

- **Tab bar** — iOS accessibility labels are `"Feed, tab, 1 of 5"`, etc. Always
  use regex: `tapOn: text: ".*Menu.*"`, `".*Chats.*"`, `".*Orders.*"`,
  `".*Offers.*"`, `".*Feed.*"`
- **Tab bar items**: Feed, Chats, Orders, Offers, Menu
- **Menu tab items** (hamburger): Profile & Settings, Redeem Points, Buy Points,
  Transaction History, Delegate Sales, Accept Delegation, Invite Friends, My
  Posts, Sign Out
- **Sub-screen navigation** — after navigating to a sub-screen via Menu, the tab
  bar may be hidden. Do NOT try to tap tab labels to go back. End the flow or
  use `tapOn: "Back"` if available.
- **scrollUntilVisible** — menu items below the fold (e.g., Delegate Sales on
  Android) need `scrollUntilVisible` before tapping.

#### To Run

```bash
# Install Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# Seed test data (reset DB + clear Mailpit)
./e2e/seed-test-data.sh

# Start the app
cd apps/expo-community && npx expo run:ios

# Run all 13 flows (iOS)
maestro test --udid <SIMULATOR_UDID> e2e/maestro/

# Run all 13 flows (Android)
maestro test --device emulator-5554 e2e/maestro/

# Run a single flow
maestro test e2e/maestro/flows/login.yaml
```

### 2.4 Web E2E Tests (Playwright)

**Scope**: `e2e/playwright/tests/*.spec.ts` **Tools**:
[Playwright](https://playwright.dev/)

These tests run against the Next.js web app (`localhost:3000`) using real
browser sessions. Tests are organized into two projects (`seller` and `buyer`)
that share the same test files but use different authenticated storage states.

#### Directory Structure

```
e2e/playwright/
├── playwright.config.ts      # Projects: setup, seller, buyer
├── helpers/
│   └── auth.ts               # Supabase auth helper (signInWithPassword)
├── tests/
│   ├── auth.setup.ts          # Auth setup: creates seller.json, buyer.json
│   ├── feed.spec.ts           # Feed page: posts, navigation
│   ├── feed-filters.spec.ts   # Feed filter tabs (All, For Sale, Wanted)
│   ├── create-post.spec.ts    # Create post form basics
│   ├── create-post-full.spec.ts # Full create post flow
│   ├── profile.spec.ts        # Profile screen
│   ├── chat.spec.ts           # Chat list
│   ├── chat-conversation.spec.ts  # Chat conversation details
│   ├── chat-order-from-chat.spec.ts # Order flow from chat
│   ├── post-management.spec.ts # My Posts management
│   ├── my-posts.spec.ts       # My Posts filters
│   ├── delegate.spec.ts       # Delegation
│   ├── orders.spec.ts         # Orders screen (seller + buyer perspectives)
│   ├── order-flow.spec.ts     # Order/Offer button visibility
│   ├── invite.spec.ts         # Invite modal and share links
│   ├── login.spec.ts          # Login flow (OTP, errors)
│   ├── hamburger-menu.spec.ts # Hamburger menu: items, Profile→/profile, no Transfer Points
│   └── points.spec.ts         # Points (buy/redeem) flow
└── .auth/
    ├── seller.json            # Seller storage state (auto-generated)
    └── buyer.json             # Buyer storage state (auto-generated)
```

#### Role-Based Testing

All test files run for both `seller` and `buyer` projects. Tests that are
role-specific use `test.skip(test.info().project.name !== "seller")` to skip for
the wrong role. This produces intentional skips (e.g., seller-only orders tests
skip for the buyer project).

#### To Run

```bash
# Seed test data
./e2e/seed-test-data.sh

# Start dev server
yarn web

# Run all 212 tests (184 pass, 28 role-based skips)
npx playwright test --config=e2e/playwright/playwright.config.ts

# Run a single file
npx playwright test --config=e2e/playwright/playwright.config.ts orders.spec.ts

# Re-run only failed tests
npx playwright test --config=e2e/playwright/playwright.config.ts --last-failed
```

## 3. CI/CD Pipeline

### Pre-Commit (Husky + lint-staged)

- **Trigger**: `git commit`
- **Action**: Runs `lint-staged` → `jest --findRelatedTests` on changed files.
- **Goal**: Prevent broken code from entering the codebase.

### Pre-Push (Husky)

- **Trigger**: `git push`
- **Action**: Runs full Jest test suite (41 suites, 575 tests) with `--bail`.
- **Goal**: Prevent regressions in all app features.
- **Note**: Edge function tests run separately via `deno test`.

## 4. Configuration Details

### Jest Config (`packages/app/jest.config.js`)

We use the `react-native` preset instead of `jest-expo` for the shared package
to avoid global scope issues in the monorepo. Transpilation is handled by Babel,
with specific `transformIgnorePatterns` for Tamagui and monorepo packages.

### Mocking Strategies

- **tamagui / @casagrown/ui**: Mocked to avoid runtime styling overhead and
  "Cannot redefine property" errors.
- **react-i18next**: Mocked to return keys for predictable text assertions.
- **Assets**: Images and Icons are mocked to prevent load failures in the test
  environment.
- **Platform-conditional imports**: Components that use `require()` at module
  level (e.g., `CommunityMap` native import) must be mocked with `jest.mock()`
  using `__esModule: true` and a `default` export. This applies to any component
  using the `Platform.OS === 'web' ? lazy(...) : require(...)` pattern.
- **Shared create-post components**: `PostFormShell`, `MediaPickerSection`, and
  `CommunityMapWrapper` have their own test files. When testing forms that use
  them, mock at the module level to avoid transitive dependency issues.
- **Expo native module mocks**: `expo-modules-core` (`NativeModule`,
  `EventEmitter`), `expo-image-picker`, and `expo-file-system` are mocked to
  prevent native module loading errors in the Jest environment. These are
  configured in `jest.setup.js` and apply to all test suites.
