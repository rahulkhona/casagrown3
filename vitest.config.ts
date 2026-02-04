import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exclude tests that shouldn't run via Vitest
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/__tests__/build.test.ts",
      "**/__tests__/dev.test.ts",
      "**/e2e/**", // Playwright tests - run via playwright, not vitest
      "packages/app/**/*.test.tsx", // App tests use Jest with react-native preset
      "packages/app/**/*.test.ts", // App tests (including ts) use Jest
    ],
  },
});
