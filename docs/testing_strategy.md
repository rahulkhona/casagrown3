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

### 2.3 Integration / E2E Tests (Maestro)

**Scope**: `.maestro/*.yaml` **Tools**: `maestro` (Mobile E2E Framework)

These tests verify the app running in a real environment (Simulator/Emulator).

- **Key Flows**:
  - **Home Screen**: Launch, content check, navigation to Login.
  - **Login**: UI verification (future: actual auth flow).

- **To Run**:
  1. Start the app: `npx expo run:ios` (or android)
  2. Run flow: `maestro test .maestro/home_screen_flow.yaml`

## 3. CI/CD Pipeline

### Pre-Commit (Husky + lint-staged)

- **Trigger**: `git commit`
- **Action**: Runs `lint-staged` → `jest --findRelatedTests` on changed files.
- **Goal**: Prevent broken code from entering the codebase.

### Pre-Push (Husky)

- **Trigger**: `git push`
- **Action**: Runs full Jest test suite (28 suites, 368 tests) with `--bail`.
- **Goal**: Prevent regressions in all app features.
- **Note**: Edge function tests run separately via `deno test`.
- **Note**: Will fail if Maestro is not installed or if the emulator is not
  running.

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
