import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';

const BASE_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://casagrown.com';
const START_URL = `${BASE_URL}/market`;

// Prevent splash screen from hiding until WebView is loaded
SplashScreen.preventAutoHideAsync();

export default function AppShell() {
  const webViewRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState(START_URL);
  const [canGoBack, setCanGoBack] = useState(false);

  // ─── 1. Deep Linking ───
  useEffect(() => {
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
        // Request Native Push Permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          webViewRef.current?.injectJavaScript(`window.receiveNativeToken('DENIED'); true;`);
          return;
        }

        const projectId = 'b27dce81-8b43-4a0b-9bc2-3c2c10b7f6c3'; // From app.json
        const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        const tokenStr = pushTokenData.data;
        webViewRef.current?.injectJavaScript(`window.receiveNativeToken('${tokenStr}'); true;`);
      }

      if (data.type === 'OPEN_APP_SETTINGS') {
        Linking.openSettings();
      }

    } catch (e: any) {
      // Push notification entitlement errors are expected on simulators — suppress them
      const msg = e?.message || '';
      if (msg.includes('aps-environment') || msg.includes('getRegistrationInfoAsync')) return;
      console.error('WebView message parsing error:', e);
    }
  };

  // ─── 4. JavaScript Injection ───
  const INJECTED_JAVASCRIPT = `
    window.IS_NATIVE_APP = true;
    document.documentElement.classList.add('native-app');
    document.documentElement.style.setProperty('--native-bottom-inset', '0px');
    true; // note: this is required, or you'll sometimes get silent failures
  `;

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        injectedJavaScriptBeforeContentLoaded={INJECTED_JAVASCRIPT}
        onMessage={onMessage}
        onNavigationStateChange={(navState) => {
          setCanGoBack(navState.canGoBack);
        }}
        onLoadEnd={() => {
          // Hide splash screen once the webview finishes its initial load
          SplashScreen.hideAsync();
        }}
        allowsBackForwardNavigationGestures={true}
        bounces={false}
        pullToRefreshEnabled={true}
        style={styles.webview}
      />
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
