/** @type {import('next').NextConfig} */
const webpack = require('webpack')

// Define __DEV__ globally for Turbopack (which doesn't use webpack plugins)
if (typeof globalThis.__DEV__ === 'undefined') {
  globalThis.__DEV__ = process.env.NODE_ENV !== 'production'
}

module.exports = {
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    'solito',
    'react-native-web',
    '@tamagui/react-native-svg',
    '@tamagui/next-theme',
    '@tamagui/lucide-icons',
    'expo',
    'expo-linking',
    'expo-constants',
    'expo-modules-core',
    'expo-image-picker',
    'expo-location',
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
  webpack: (config, { isServer, dev }) => {
    // Define __DEV__ for React Native packages
    config.plugins.push(
      new webpack.DefinePlugin({
        __DEV__: JSON.stringify(dev),
      })
    )
    return config
  },
}
