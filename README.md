# CasaGrown 3.0 (Universal App)

A universal React Native + Next.js application built with Solito, Tamagui, and Expo.

## 🚀 Getting Started

### Prerequisites
- Node.js (LTS)
- Yarn 4+ (Corepack enabled)
- Expo Go (or iOS Simulator / Android Emulator)
- [Maestro CLI](https://maestro.mobile.dev/) (Required for E2E tests)

### Installation
```bash
# Install dependencies
yarn install

# Setup Husky hooks (CI/CD)
yarn prepare
```

### Running Development
```bash
# Web (Next.js)
yarn web

# iOS (Expo)
yarn ios

# Android (Expo)
yarn android
```

## 🧪 Testing

We use a layered testing strategy to ensure quality.

### 1. Unit & Snapshot Tests (Jest)
Runs on `pre-commit` for modified files. Validates component rendering, localization, and logic.

```bash
# Run all unit tests
yarn workspace @casagrown/app jest

# Update snapshots
yarn workspace @casagrown/app jest -u
```

### 2. End-to-End Tests (Maestro)
Runs on `pre-push` to prevent regressions in critical flows. **Requires the app to be running in an emulator.**

```bash
# 1. Start the app in an emulator
yarn ios # or yarn android

# 2. Run the test flow
maestro test .maestro/home_screen_flow.yaml
```

## 🔐 Native Authentication
We use Supabase Auth with a custom Native adapter.
- **iOS Localhost**: The app automatically rewrites `127.0.0.1` to `localhost` to work around Simulator networking quirks.
- **Android Emulator**: Rewrites to `10.0.2.2`.
- **Social Login**: Currently mocks the provider flow in `development` to fallback to a Password login (User: `mock@social.com`) if keys are missing.

## 🏗 Architecture

- **Apps**: Entry points for Web (`apps/next-community`) and Mobile (`apps/expo-community`).
- **Packages**:
    - `packages/app`: Shared business logic, screens, and features.
    - `packages/ui`: Shared design system and atomic components.
- **Backend**: Supabase (Edge Functions, Auth, Database).

See [docs/architecture_guidelines.md](docs/architecture_guidelines.md) for detailed standards.
