import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      // Vitest needs this so app/login/page.tsx's `../lib/supabase` resolves
      // through the project's lib/ folder without needing the full monorepo graph.
    },
  },
})
