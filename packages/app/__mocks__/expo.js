// Mock for expo package (useEvent hook) used in tests
const React = require('react');

// useEvent: returns a stateful value from an event emitter, with initial state
const useEvent = (emitter, eventName, initialValue) => {
  const [value, setValue] = React.useState(initialValue || {});
  return value;
};

// useEventListener: no-op in tests
const useEventListener = () => {};

module.exports = {
  useEvent,
  useEventListener,
};
