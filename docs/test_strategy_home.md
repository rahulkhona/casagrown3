# Testing Strategy: Home Screen

## 1. Overview
This document outlines the testing strategy for the `HomeScreen` component in the Casagrown universal app. The goal is to ensure visual consistency, functional correctness (navigation, localization), and stability across updates.

## 2. Test Pyramid

### 2.1 Unit & Snapshot Tests (Jest)
**Scope**: `packages/app/features/home/screen.test.tsx`
**Tools**: `jest`, `@testing-library/react-native`, `react-test-renderer`

These tests verify the component in isolation. We mock external dependencies (Navigation, i18n, icons) to focus on the component logic and rendering.

- **Snapshot Testing**:
  - **Purpose**: Regression testing. Ensures the UI structure (DOM/View hierarchy) does not changing unexpectedly.
  - **Command**: `yarn workspace @casagrown/app jest`
  - **Update Snapshots**: `yarn workspace @casagrown/app jest -u`

- **Localization Verification**:
  - **Purpose**: Ensures all user-facing text uses translation keys (`t('home.title')`) instead of hardcoded strings.
  - **Method**: The mock i18n returns the key itself, so we assert `getByText('home.title')` exists.

- **Interaction Testing**:
  - **Purpose**: Verifies that button presses trigger the correct callbacks.
  - **Method**: `fireEvent.press(button)` and assert `onLinkPress` mock is called.

### 2.2 Integration / E2E Tests (Maestro)
**Scope**: `.maestro/home_screen_flow.yaml`
**Tools**: `maestro` (Mobile E2E Framework)

These tests verify the app running in a real environment (Simulator/Emulator). This catches issues that unit tests miss, such as native module crashes, safe area issues, or styling bugs that only appear on-device.

- **Flow**:
  1. **Launch App**: Verifies app starts without crashing.
  2. **Verify Content**: Checks for visibility of "Join the Movement" button.
  3. **Navigation**: Taps the button and verifies transition to the Login Screen.

**To Run**:
1. Start the app: `npx expo run:ios` (or android)
2. Run flow: `maestro test .maestro/home_screen_flow.yaml`

## 3. Configuration Details

### Jest Config (`packages/app/jest.config.js`)
We use the `react-native` preset instead of `jest-expo` for the shared package to avoid global scope issues in the monorepo.
```javascript
module.exports = {
  preset: 'react-native',
  rootDir: '.',
  transformIgnorePatterns: [
    // Whitelist specific packages for transformation
    "node_modules/(?!((jest-)?react-native|@casagrown|@tamagui|tamagui)...)"
  ],
};
```

### Mocking Strategies
- **@casagrown/ui**: Mocked to avoid "Cannot redefine property" errors caused by duplicate exports in the UI package during test execution.
- **react-i18next**: Mocked to return keys for predictable text assertions.

## 4. Future Improvements
- Add Visual Regression Testing (e.g., Percy or Storybook) for pixel-perfect checks.
- Add Accessibility Audits (jest-axe) to unit tests.
