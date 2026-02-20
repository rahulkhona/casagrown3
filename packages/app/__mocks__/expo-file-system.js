// Mock for expo-file-system — used via OfferSheet → load-media-helper.native
// Covers both `expo-file-system` and `expo-file-system/next` subpath

const File = class MockFile {
  constructor(uri) {
    this.uri = uri || '';
  }
  get exists() { return true; }
  get size() { return 0; }
  get md5() { return ''; }
  text() { return Promise.resolve(''); }
  base64() { return Promise.resolve(''); }
  copy(to) { return Promise.resolve(); }
  move(to) { return Promise.resolve(); }
  delete() { return Promise.resolve(); }
};

const Paths = {
  cache: { uri: 'file:///cache' },
  document: { uri: 'file:///document' },
};

module.exports = {
  // expo-file-system/next exports
  File,
  Paths,
  Directory: {},

  // expo-file-system classic exports
  documentDirectory: 'file:///document/',
  cacheDirectory: 'file:///cache/',
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false, isDirectory: false, size: 0 }),
  downloadAsync: jest.fn().mockResolvedValue({ uri: '', status: 200, headers: {} }),
  createDownloadResumable: jest.fn(),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
};
