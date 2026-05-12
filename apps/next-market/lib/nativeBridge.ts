'use client'

/**
 * A central utility for bridging the Next.js web app to the React Native Expo wrapper.
 * This ensures that native features (like push notifications) are only requested
 * if the app is actually running inside the WebView wrapper.
 */

// Define the global window augmentations for TypeScript
declare global {
  interface Window {
    IS_NATIVE_APP?: boolean;
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    receiveNativeToken?: (token: string) => void;
  }
}

export const NativeBridge = {
  /**
   * Returns true if the Next.js app is currently running inside the Expo WebView.
   * This is determined by the `IS_NATIVE_APP` flag injected by the wrapper on boot.
   */
  get isNative() {
    return typeof window !== 'undefined' && !!window.IS_NATIVE_APP;
  },

  /**
   * Sends a message to the Expo wrapper to trigger the native iOS/Android
   * push notification permission prompt.
   */
  requestPushPermissions: () => {
    if (typeof window !== 'undefined' && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_PUSH_PERMISSION' }));
    }
  },

  /**
   * Sends a message to the Expo wrapper to trigger `Linking.openSettings()`.
   * Used to help a user re-enable notifications if they previously denied the OS prompt.
   */
  openAppSettings: () => {
    if (typeof window !== 'undefined' && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_APP_SETTINGS' }));
    }
  }
};
