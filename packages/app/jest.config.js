const path = require('path');

module.exports = {
  preset: 'react-native',
  rootDir: '.',
  roots: ['<rootDir>'],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@casagrown|@tamagui|tamagui|solito)"
  ],
  moduleNameMapper: {
    '^expo-video$': '<rootDir>/__mocks__/expo-video.js',
    '^expo$': '<rootDir>/__mocks__/expo.js',
    '^react-native-webview$': '<rootDir>/__mocks__/react-native-webview.js',
    '^expo-modules-core$': '<rootDir>/__mocks__/expo-modules-core.js',
    '^expo-modules-core/(.*)$': '<rootDir>/__mocks__/expo-modules-core.js',
    '^expo-image-picker$': '<rootDir>/__mocks__/expo-image-picker.js',
    '^expo-file-system(.*)$': '<rootDir>/__mocks__/expo-file-system.js',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
