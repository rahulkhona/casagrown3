// Mock for react-native-webview used in tests
const React = require('react');

const WebView = React.forwardRef((props, ref) => {
  React.useImperativeHandle(ref, () => ({
    injectJavaScript: jest.fn(),
    reload: jest.fn(),
    goBack: jest.fn(),
    goForward: jest.fn(),
  }));
  return React.createElement('WebView', props);
});

module.exports = {
  WebView,
  default: WebView,
};
