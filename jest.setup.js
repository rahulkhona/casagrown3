/**
 * Jest setup file for react-native testing.
 * Provides global mocks for native modules that lack JS implementations.
 */

// Mock expo-secure-store (used by auth-storage.ts)
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-file-system (native module, not available in Node.js)
jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false, size: 0 }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

// Mock react-native-qrcode-svg
jest.mock('react-native-qrcode-svg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props) => React.createElement('View', props),
  };
});

// Fix RN Share getter issue: override the read-only Share module
jest.mock('react-native/Libraries/Share/Share', () => ({
  share: jest.fn().mockResolvedValue({ action: 'sharedAction' }),
}));
