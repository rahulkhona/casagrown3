// Mock for expo-modules-core — avoids EventEmitter crash in Jest
// This is the root dependency for expo-image-picker, expo-file-system, etc.
const EventEmitter = class MockEventEmitter {
  constructor() {}
  addListener() { return { remove: () => {} }; }
  removeAllListeners() {}
  removeSubscription() {}
  emit() {}
};

const NativeModulesProxy = new Proxy({}, {
  get: () => new Proxy({}, {
    get: () => () => Promise.resolve(),
  }),
});

module.exports = {
  EventEmitter,
  NativeModulesProxy,
  requireNativeModule: () => new Proxy({}, {
    get: () => () => {},
  }),
  requireOptionalNativeModule: () => null,
  requireNativeViewManager: () => () => null,
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios || obj.default,
  },
  CodedError: class CodedError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName, propertyName) {
      super(`${moduleName}.${propertyName} is not available`);
    }
  },
};
