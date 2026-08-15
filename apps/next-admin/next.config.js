// Define __DEV__ globally for Turbopack (which doesn't use webpack plugins)
if (typeof globalThis.__DEV__ === 'undefined') {
  globalThis.__DEV__ = process.env.NODE_ENV !== 'production'
}

/** @type {import('next').NextConfig} */
module.exports = {
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    'solito',
    'react-native-web',
    '@tamagui/react-native-svg',
    '@tamagui/next-theme',
    '@tamagui/lucide-icons',
    'expo-linking',
    'expo-constants',
    'expo-modules-core',
    '@casagrown/ui',
    '@casagrown/app',
    '@casagrown/config',
  ],
  experimental: {
    scrollRestoration: true,
  },
  turbopack: {
    root: require('path').resolve(__dirname, '../../'),
    resolveAlias: {
      'react-native': 'react-native-web',
      'react-native-svg': '@tamagui/react-native-svg',
      'react-native-safe-area-context': './shims/react-native-safe-area-context.js',
      '@stripe/stripe-react-native': './shims/stripe-react-native.js',
      // Force single copies of Tamagui internals to prevent config duplication
      // between the app code and @tamagui/lucide-icons
      '@tamagui/core': '@tamagui/core',
      '@tamagui/web': '@tamagui/web',
    },
    resolveExtensions: [
      '.web.tsx',
      '.web.ts',
      '.web.js',
      '.web.jsx',
      '.tsx',
      '.ts',
      '.js',
      '.jsx',
      '.json',
    ],
  },
}

