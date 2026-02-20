// Mock for expo package — hooks + native module helpers used in tests
const React = require('react');

// useEvent: returns a stateful value from an event emitter, with initial state
const useEvent = (emitter, eventName, initialValue) => {
  const [value, setValue] = React.useState(initialValue || {});
  return value;
};

// useEventListener: no-op in tests
const useEventListener = () => {};

// requireNativeModule: returns a Proxy that no-ops all calls
const requireNativeModule = () => new Proxy({}, {
  get: () => (...args) => Promise.resolve(),
});

const requireOptionalNativeModule = () => null;

const NativeModulesProxy = new Proxy({}, {
  get: () => new Proxy({}, {
    get: () => () => Promise.resolve(),
  }),
});

module.exports = {
  useEvent,
  useEventListener,
  requireNativeModule,
  requireOptionalNativeModule,
  NativeModulesProxy,
};
