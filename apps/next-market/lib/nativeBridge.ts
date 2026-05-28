'use client'

/**
 * A central utility for bridging the Next.js web app to the React Native Expo wrapper.
 * This ensures that native features (like push notifications, location, camera)
 * are only requested if the app is actually running inside the WebView wrapper.
 */

// Define the global window augmentations for TypeScript
declare global {
  interface Window {
    IS_NATIVE_APP?: boolean;
    NATIVE_SUPPORTS_LOCATION?: boolean;
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    receiveNativeToken?: (token: string) => void;
    receiveNativeLocation?: (result: {
      lat: number;
      lng: number;
      error?: string;
    } | { error: string }) => void;
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
   * Returns true if the native wrapper supports the REQUEST_LOCATION bridge message.
   * Old builds (e.g. Android in review) won't have this flag, so the market page
   * will gracefully fall back to navigator.geolocation.
   */
  get supportsLocation() {
    return typeof window !== 'undefined' && !!window.NATIVE_SUPPORTS_LOCATION;
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
  },

  /**
   * Requests the device's current location via the native Expo wrapper.
   * Uses expo-location under the hood, which properly registers in iOS Location Services.
   * Returns a Promise that resolves with { lat, lng } or rejects with an error.
   */
  requestLocation: (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.ReactNativeWebView) {
        reject(new Error('Not running in native wrapper'));
        return;
      }

      // Set up the callback that the Expo wrapper will invoke
      window.receiveNativeLocation = (result) => {
        // Clean up callback
        delete window.receiveNativeLocation;
        if ('error' in result && result.error) {
          reject(new Error(result.error));
        } else if ('lat' in result && 'lng' in result) {
          resolve({ lat: result.lat, lng: result.lng });
        } else {
          reject(new Error('Invalid location response'));
        }
      };

      // Timeout after 15 seconds
      setTimeout(() => {
        if (window.receiveNativeLocation) {
          delete window.receiveNativeLocation;
          reject(new Error('Location request timed out'));
        }
      }, 15000);

      // Send the request to the Expo wrapper
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_LOCATION' }));
    });
  },
};
