import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, BackHandler, KeyboardAvoidingView, Platform, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';

const BASE_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://casagrown.com';
const START_URL = `${BASE_URL}/market`;

const getBaseHostname = (): string => {
  try {
    const { hostname } = new URL(BASE_URL);
    return hostname;
  } catch {
    return 'casagrown.com';
  }
};

const baseHostname = getBaseHostname();

/** URLs matching these hostnames stay inside the WebView; everything else opens in the system browser. */
const isInternalUrl = (url: string): boolean => {
  try {
    // Allow blob/data URLs (file downloads, inline content)
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('about:')) return true;

    const { hostname } = new URL(url);
    return (
      hostname === baseHostname ||
      hostname === 'casagrown.com' ||
      hostname.endsWith('.casagrown.com') ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.local') ||           // Allow all local mDNS hostnames (e.g., test.local)
      // Allow private/local IP addresses in development
      /^192\.168\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      hostname.endsWith('.supabase.co') ||     // Supabase auth flows
      hostname === 'checkout.stripe.com' ||    // Stripe checkout for Pro subscriptions
      hostname === 'www.facebook.com' ||       // Facebook OAuth flow
      hostname === 'web.facebook.com'          // Facebook OAuth flow (alt)
    );
  } catch {
    return true; // If URL can't be parsed, let the WebView handle it
  }
};

// Prevent splash screen from hiding until WebView is loaded
SplashScreen.preventAutoHideAsync();

// Set up notification handler for foreground notifications
Notifications.setNotificationHandler({
  shouldShowAlert: true,
  shouldPlaySound: true,
  shouldSetBadge: false,
  shouldShowBanner: true,
  shouldShowList: true,
} as any);

// Create default notification channel (required for Android 8+)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'CasaGrown',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#22c55e',
    sound: 'default',
  });
}

export default function AppShell() {
  const webViewRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState(START_URL);
  const [canGoBack, setCanGoBack] = useState(false);

  const checkAndSendNotificationPermission = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      const js = `
        if (typeof window !== 'undefined') {
          window.NATIVE_NOTIFICATION_PERMISSION = ${JSON.stringify(status)};
          localStorage.setItem('casagrown_native_push_registered', ${JSON.stringify(status)});
          window.dispatchEvent(new CustomEvent('nativeNotificationPermissionSync', { detail: ${JSON.stringify(status)} }));
        }
        true;
      `;
      webViewRef.current?.injectJavaScript(js);
    } catch (e) {
      console.warn('Error checking native permission:', e);
    }
  };

  // ─── 1. Deep Linking & AppState ───
  useEffect(() => {
    // AppState listener to sync notification permission back when returning to app
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkAndSendNotificationPermission();
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // Handle cold boot URL
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // Handle background URL
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    // Handle push notification taps
    const notifSub = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response.notification.request.content.data?.url;
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => {
      appStateSub.remove();
      sub.remove();
      notifSub.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    try {
      const parsed = Linking.parse(url);
      if (parsed.hostname === 'casagrown.com' || parsed.hostname === 'localhost') {
        const fullUrl = `https://${parsed.hostname}${parsed.path ? '/' + parsed.path : ''}${parsed.queryParams ? '?' + new URLSearchParams(parsed.queryParams as any).toString() : ''}`;
        setCurrentUrl(fullUrl);
      }
    } catch (e) {
      console.warn('Invalid deep link:', url);
    }
  };

  // ─── 2. Android Back Handler ───
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // Prevent default behavior (exiting app)
      }
      return false; // Let OS exit app
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [canGoBack]);

  // ─── 3. The Bi-Directional Bridge ───
  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'REQUEST_PUSH_PERMISSION') {
        try {
          // Request Native Push Permissions
          const { status: existingStatus } = await Notifications.getPermissionsAsync();
          let finalStatus = existingStatus;
          if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
          }

          if (finalStatus !== 'granted') {
            const js = `
              if (typeof window !== 'undefined' && window.receiveNativeToken) {
                window.receiveNativeToken('DENIED');
                localStorage.setItem('casagrown_native_push_registered', 'denied');
              }
              true;
            `;
            webViewRef.current?.injectJavaScript(js);
            return;
          }

          const projectId = Constants.expoConfig?.extra?.eas?.projectId;
          if (!projectId) {
            console.error('Missing EAS projectId in app.json');
            const js = `
              if (typeof window !== 'undefined' && window.receiveNativeToken) {
                window.receiveNativeToken('DENIED');
                localStorage.setItem('casagrown_native_push_registered', 'denied');
              }
              true;
            `;
            webViewRef.current?.injectJavaScript(js);
            return;
          }
          const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
          const tokenStr = pushTokenData.data;
          const js = `
            if (typeof window !== 'undefined' && window.receiveNativeToken) {
              window.receiveNativeToken(${JSON.stringify(tokenStr)});
              localStorage.setItem('casagrown_native_push_registered', 'granted');
            }
            true;
          `;
          webViewRef.current?.injectJavaScript(js);
        } catch (pushErr: any) {
          console.error('Push token error:', pushErr);
          const errMsg = pushErr?.message || 'Unknown push error';
          const js = `
            if (typeof window !== 'undefined' && window.receiveNativeToken) {
              window.receiveNativeToken('DENIED');
              localStorage.setItem('casagrown_native_push_registered', 'denied');
              console.error('Native push error:', ${JSON.stringify(errMsg)});
            }
            true;
          `;
          webViewRef.current?.injectJavaScript(js);
        }
      }

      if (data.type === 'OPEN_APP_SETTINGS') {
        Linking.openSettings();
      }

      if (data.type === 'REQUEST_LOCATION') {
        try {
          // Request native location permission (registers in iOS Location Services)
          const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
          let finalStatus = existingStatus;
          if (existingStatus !== 'granted') {
            const { status } = await Location.requestForegroundPermissionsAsync();
            finalStatus = status;
          }

          if (finalStatus !== 'granted') {
            const js = `
              if (typeof window !== 'undefined' && window.receiveNativeLocation) {
                window.receiveNativeLocation({ error: 'DENIED' });
              }
              true;
            `;
            webViewRef.current?.injectJavaScript(js);
            return;
          }

          // Get current position
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          const js = `
            if (typeof window !== 'undefined' && window.receiveNativeLocation) {
              window.receiveNativeLocation({
                lat: ${position.coords.latitude},
                lng: ${position.coords.longitude}
              });
            }
            true;
          `;
          webViewRef.current?.injectJavaScript(js);
        } catch (locErr: any) {
          console.error('Native location error:', locErr);
          const errMsg = locErr?.message || 'Location unavailable';
          const js = `
            if (typeof window !== 'undefined' && window.receiveNativeLocation) {
              window.receiveNativeLocation({ error: ${JSON.stringify(locErr?.message || 'Location unavailable')} });
            }
            true;
          `;
          webViewRef.current?.injectJavaScript(js);
        }
      }

    } catch (e: any) {
      console.error('WebView message parsing error:', e);
    }
  };

  // ─── 4. JavaScript Injection ───
  // NOTE: When adding new bridge capabilities, always inject a capability flag here
  // so the web page can detect support before using it. This ensures backward
  // compatibility with older native builds (e.g. Android in review).
  const appName = Constants.appOwnership === 'expo' ? 'Expo Go' : (Constants.expoConfig?.name || 'CasaGrown');
  const INJECTED_JAVASCRIPT = `
    window.IS_NATIVE_APP = true;
    window.NATIVE_SUPPORTS_LOCATION = true;
    window.NATIVE_APP_NAME = ${JSON.stringify(appName)};
    document.documentElement.classList.add('native-app');
    document.documentElement.style.setProperty('--native-bottom-inset', '0px');
    true; // note: this is required, or you'll sometimes get silent failures
  `;

  const webview = (
    <WebView
      ref={webViewRef}
      source={{ uri: currentUrl }}
      injectedJavaScriptBeforeContentLoaded={INJECTED_JAVASCRIPT}
      inspectable={true}
      onMessage={onMessage}
      onNavigationStateChange={(navState) => {
        setCanGoBack(navState.canGoBack);
      }}
      onShouldStartLoadWithRequest={(request: WebViewNavigation) => {
        // External links (USDA, OFN, farmer sites) → open in system browser
        if (!isInternalUrl(request.url)) {
          Linking.openURL(request.url);
          return false; // Cancel WebView navigation
        }
        return true; // Internal CasaGrown / auth pages stay in WebView
      }}
      onLoadEnd={() => {
        // Hide splash screen once the webview finishes its initial load
        SplashScreen.hideAsync();
        checkAndSendNotificationPermission();
      }}
      allowsBackForwardNavigationGestures={true}
      bounces={false}
      pullToRefreshEnabled={true}
      overScrollMode="never"
      mediaCapturePermissionGrantType="grant"
      allowsInlineMediaPlayback={true}
      style={styles.webview}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      {Platform.OS === 'android' ? (
        <KeyboardAvoidingView style={styles.container} behavior="height">
          {webview}
        </KeyboardAvoidingView>
      ) : (
        webview
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
