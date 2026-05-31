import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Inject required env variables for supabase client in tests
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
    },
    environment: 'jsdom',
    // Exclude tests that shouldn't run via Vitest
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/__tests__/build.test.ts",
      "**/__tests__/dev.test.ts",
      "**/e2e/**", // Playwright tests - run via playwright, not vitest
      "packages/app/**/*.test.tsx", // App tests use Jest with react-native preset
      "packages/app/**/*.test.ts", // App tests (including ts) use Jest
      "**/supabase/**", // Deno Edge Functions run via Deno test
    ],
  },
});
