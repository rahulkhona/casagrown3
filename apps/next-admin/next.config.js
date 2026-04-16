const { withTamagui } = require('@tamagui/next-plugin')

/** @type {import('next').NextConfig} */
const config = {
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
    resolveAlias: {
      'react-native': 'react-native-web',
      'react-native-svg': '@tamagui/react-native-svg',
      'react-native-safe-area-context': './shims/react-native-safe-area-context.js',
      '@stripe/stripe-react-native': './shims/stripe-react-native.js',
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

module.exports = withTamagui({
  config: '../../packages/config/src/tamagui.config.ts',
  components: ['tamagui', '@casagrown/ui'],
  outputCSS: process.env.NODE_ENV === 'production',
  doesNotCompileTwice: true,
})(config)
