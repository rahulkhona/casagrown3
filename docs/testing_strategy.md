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
├── config.yaml           # appId, env vars, ordered flow list
├── flows/
│   ├── login.yaml            # Full login + OTP verification
│   ├── feed-navigation.yaml  # Feed → Profile → Back
│   ├── create-post.yaml      # Create Post → Sell form → Back
│   ├── profile-management.yaml  # Avatar → Profile Settings → Back
│   ├── chat.yaml             # Menu → Chats → Back
│   ├── delegation.yaml       # Menu → Delegate Sales → Back
│   ├── post-management.yaml  # Menu → My Posts → Back
│   ├── orders.yaml           # Orders screen: tabs, cards, click-to-chat
│   ├── order-flow.yaml       # Conditional: tap Order if visible
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

- **Avatar tap** → Profile screen (e.g., `tapOn: { text: "T", index: 0 }`)
- **Hamburger menu** → `tapOn: "Menu"` opens navigation drawer (Chats, My Posts,
  Delegate Sales)
- **Back navigation** → `tapOn: "Back"` (all screens have
  `accessibilityLabel="Back"` on their back buttons)

#### To Run

```bash
# Install Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# Seed test data (reset DB + clear Mailpit)
./e2e/seed-test-data.sh

# Start the app
cd apps/expo-community && npx expo run:ios

# Run all 9 flows
maestro test e2e/maestro/

# Run a single flow
maestro test e2e/maestro/flows/login.yaml

# Run on a specific device
maestro --device <DEVICE_UDID> test e2e/maestro/
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
│   └── order-flow.spec.ts     # Order/Offer button visibility
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

# Run all 180 tests (164 pass, 16 role-based skips)
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
- **Action**: Runs full Jest test suite (36 suites, 520 tests) with `--bail`.
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
