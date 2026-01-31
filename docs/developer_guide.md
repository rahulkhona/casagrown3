# Developer Guide

Welcome to the Casagrown monorepo! This guide contains instructions for running, testing, and contributing to the universal applications.

## Getting Started

Follow these steps to set up your local development environment.

### 1. Installation
Ensure you have Node.js (v22+) and Yarn 4 installed. Run the following in the root directory:
```bash
yarn install
```

### 2. Running the Applications
We use a monorepo structure where each application is a workspace. You can start them from the root using these convenience scripts:

#### **Community App**
- **Web**: `yarn web` (Next.js development server)
- **Native**: `yarn native` (Expo development server)

#### **Admin App**
- **Web**: `yarn web:admin`
- **Native**: `yarn native:admin`

### 3. Native Development
For mobile development, you can use the Expo Go app or create local development builds:
```bash
# Community
cd apps/expo-community
yarn ios # or yarn android

# Admin
cd apps/expo-admin
yarn ios # or yarn android
```

---

## Development Workflow

### Local-First "Mock CD"
To ensure code quality before pushing to GitHub:
1. **Linting**: Run `npm run lint` periodically.
2. **Type Checking**: Run `npm run type-check` to catch TypeScript errors.
3. **Unit Tests**: Run `npm run test` to verify logic.

### Shared Packages
Most UI and logic are shared across apps in the `packages/` directory:
- `@casagrown/ui`: Shared Tamagui components.
- `@casagrown/app`: Shared screens and business logic.
- `@casagrown/config`: Centralized Tamagui and theme configurations.

---

## Testing Strategy

### Unit Testing
We use **Jest** for testing shared packages.
```bash
yarn test
```

### Integration Testing
- **Web**: Use **Playwright** in `apps/next-*`.
- **Mobile**: Use **Maestro** for native automation.

### Database
Manage your local Supabase instance:
```bash
npx supabase start
npx supabase stop
```
Check scraping logs and progress using the queries defined in `docs/data_model.md`.
