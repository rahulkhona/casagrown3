# Architecture Guidelines: Universal App (Tamagui + Solito)

This document outlines the architectural standards and development workflows for the Casagrown universal applications (Community and Admin).

## Core Technology Stack

- **[Solito](https://solito.dev/)**: The bridge for universal navigation between React Navigation (Native) and Next.js (Web).
- **[Tamagui](https://tamagui.dev/)**: Styling system and UI component library for shared components between web and native.
- **[Expo](https://expo.dev/)**: Framework for Native iOS and Android development.
- **[Next.js](https://nextjs.org/)**: Framework for Web/Desktop development.
- **[Supabase](https://supabase.com/)**: Backend as a Service (Database, Auth, Edge Functions).

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
- Always use **Tamagui** components (`Stack`, `Text`, `Button`, etc.) instead of standard `div` or `View`.
- Place reusable UI components in `packages/ui`.
- Screen-level components belong in `packages/app/features`.

### 2. Universal Navigation
- Use Solito's `Link` and `useNavigate` to ensure navigation works as a standard router on web and React Navigation on mobile.
- Define routes in `packages/app/provider/navigation`.

### 3. Testing Standards
- **Unit Tests**: Use **Jest** with React/React Native Testing Library. Aim for high coverage on shared logic and `packages/ui`.
- **Integration (Web)**: Use **Playwright** for end-to-end flows on web.
- **Integration (Mobile)**: Use **Maestro** for mobile UI testing.

### 4. Form Validation
- Use **Zod** (`zod`) for all data validation schemas.
- Define schemas in a separate file (e.g., `schemas.ts`) to keep components clean.
- Share schemas between Frontend and Backend (Supabase Edge Functions) where possible.

## CI/CD and Local Workflow

### Local-First "Mock CD"
To maintain quality during local development before full cloud integration:
- **Fast Refresh**: Leverage HMR in both Next.js and Expo for instant UI feedback.
### Local Automated CI/CD (Pre-Commit)
To enforce quality standards automatically before code is shared:
- **Tooling**: We use **Husky** (git hooks) and **lint-staged**.
- **Workflow**:
    - On `git commit`, Husky triggers the pre-commit hook.
    - `lint-staged` identifies all *staged* (modified) files.
    - **Actions**:
        - `packages/app/**/*.{ts,tsx}` -> Runs `jest --findRelatedTests` (Unit & Snapshot Tests).
        - (Future) `**/*.{ts,tsx}` -> Runs `tsc` (Type Check) and `eslint`.
- **Bypass**: In emergencies, use `git commit --no-verify`, but this is discouraged.

### Local Manual/Semi-Automated E2E (Pre-Push)
To ensure critical user flows work before pushing to the repository:
- **Tooling**: **Maestro** via Husky `pre-push` hook.
- **Workflow**:
    - On `git push`, the hook triggers.
    - **Action**: Runs `maestro test .maestro/home_screen_flow.yaml`.
- **Requirement**: The app must be running (Simulator/Emulator) for this to pass.
- **Bypass**: Use `git push --no-verify` if you are skipping E2E (e.g., purely documentation changes).

### Local-First "Mock CD"
- **Fast Refresh**: Leverage HMR in both Next.js and Expo for instant UI feedback.
- **Shadow Builds**: Periodically run `npm run build` to verify production bundling behavior.

### Cloud Orchestration (Future)
- **GitHub Actions**: Automated CI runners.
- **Vercel**: Automated Web deployments.
- **EAS (Expo Application Services)**: Remote Native builds and OTA updates.
