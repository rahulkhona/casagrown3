// Mock for react-native-compressor
module.exports = {
  Video: {
    compress: jest.fn((uri) => Promise.resolve(uri)),
  },
  Image: {
    compress: jest.fn((uri) => Promise.resolve(uri)),
  },
  Audio: {
    compress: jest.fn((uri) => Promise.resolve(uri)),
  },
};
