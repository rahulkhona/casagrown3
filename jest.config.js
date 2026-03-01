/** @type {import('jest').Config} */
module.exports = {
  // Use the official react-native Jest preset for native module mocking
  preset: 'react-native',
  transform: {
    // Project source files: TypeScript + JSX
    '^(?!.*node_modules).*\\.[jt]sx?$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
        '@babel/preset-typescript',
      ],
    }],
    // node_modules that need transforming: use RN babel preset (handles Flow)
    'node_modules/.+\\.[jt]sx?$': ['babel-jest', {
      presets: ['@react-native/babel-preset'],
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '@testing-library/react-native|' +
      'react-native|' +
      '@react-native|' +
      'react-native-safe-area-context|' +
      'react-native-css-interop|' +
      'react-native-reanimated|' +
      'react-native-gesture-handler|' +
      'react-native-qrcode-svg|' +
      'react-native-svg|' +
      'expo-secure-store|' +
      'expo-modules-core|' +
      'expo-clipboard|' +
      'expo-sharing|' +
      'expo-constants|' +
      'expo-file-system|' +
      'expo-font|' +
      'expo-asset|' +
      'expo-image-picker|' +
      'expo-location|' +
      'expo-media-library|' +
      'expo-notifications|' +
      'expo-linking|' +
      'expo-updates|' +
      'expo-haptics|' +
      'expo|' +
      '@expo|' +
      'solito|' +
      'moti|' +
      'tamagui|' +
      '@tamagui' +
    ')/)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '/apps/next-admin/',
    '/apps/next-community/',
    '/apps/next-community-voice/',
    'supabase/functions',
    '<rootDir>/test.js',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
