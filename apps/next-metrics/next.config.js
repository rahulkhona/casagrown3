/** @type {import('next').NextConfig} */
const webpack = require('webpack')

// Define __DEV__ globally for Turbopack
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
    '@casagrown/ui',
    '@casagrown/app',
    '@casagrown/config',
  ],
  devIndicators: false,
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
    config.resolve.extensions = [
      '.web.tsx', '.web.ts', '.web.js', '.web.jsx',
      ...config.resolve.extensions,
    ]
    config.resolve.alias = {
      ...config.resolve.alias,
      '@stripe/stripe-react-native': require('path').resolve(__dirname, './shims/stripe-react-native.js'),
    }
    config.plugins.push(
      new webpack.DefinePlugin({
        __DEV__: JSON.stringify(dev),
      })
    )
    return config
  },
}
