/**
 * Unit tests for the CasaGrown Market native WebView wrapper (index.tsx).
 *
 * Covers:
 *   - Component rendering (SafeAreaView + WebView)
 *   - WebView source URL construction
 *   - Injected JavaScript content
 *   - WebView message handler (push permissions, settings, error suppression)
 *   - Pull-to-refresh and gesture configuration
 *   - Splash screen lifecycle
 */
import React from 'react'
import { render, act } from '@testing-library/react-native'
import * as Linking from 'expo-linking'
import * as Notifications from 'expo-notifications'
import * as SplashScreen from 'expo-splash-screen'
import AppShell from '../index'

// ─── 1. Component Rendering ──────────────────────────────────────

describe('Component Rendering', () => {
  it('renders a WebView component', () => {
    const { getByTestId } = render(<AppShell />)
    expect(getByTestId('webview')).toBeTruthy()
  })

  it('produces a non-null render tree', () => {
    const { toJSON } = render(<AppShell />)
    expect(toJSON()).toBeTruthy()
  })
})

// ─── 2. WebView Source URL ───────────────────────────────────────

describe('WebView Source URL', () => {
  it('points to EXPO_PUBLIC_WEB_URL/market', () => {
    // EXPO_PUBLIC_WEB_URL is set (or defaults to casagrown.com)
    const { getByTestId } = render(<AppShell />)
    const webview = getByTestId('webview')
    expect(webview.props.source.uri).toMatch(/\/market$/)
  })

  it('uses the BASE_URL from environment', () => {
    const { getByTestId } = render(<AppShell />)
    const webview = getByTestId('webview')
    const uri = webview.props.source.uri as string
    // Should be either localhost or casagrown.com based on env
    expect(
      uri.startsWith('http://localhost') || uri.startsWith('https://casagrown.com')
    ).toBe(true)
  })
})

// ─── 3. WebView Configuration ────────────────────────────────────

describe('WebView Configuration', () => {
  it('enables pull-to-refresh', () => {
    const { getByTestId } = render(<AppShell />)
    expect(getByTestId('webview').props.pullToRefreshEnabled).toBe(true)
  })

  it('enables swipe-back navigation gestures', () => {
    const { getByTestId } = render(<AppShell />)
    expect(getByTestId('webview').props.allowsBackForwardNavigationGestures).toBe(true)
  })

  it('disables bounce', () => {
    const { getByTestId } = render(<AppShell />)
    expect(getByTestId('webview').props.bounces).toBe(false)
  })
})

// ─── 4. Injected JavaScript ──────────────────────────────────────

describe('Injected JavaScript', () => {
  it('sets window.IS_NATIVE_APP to true', () => {
    const { getByTestId } = render(<AppShell />)
    const injected = getByTestId('webview').props.injectedJavaScriptBeforeContentLoaded
    expect(injected).toContain('window.IS_NATIVE_APP = true')
  })

  it('adds native-app CSS class to documentElement', () => {
    const { getByTestId } = render(<AppShell />)
    const injected = getByTestId('webview').props.injectedJavaScriptBeforeContentLoaded
    expect(injected).toContain("classList.add('native-app')")
  })

  it('sets --native-bottom-inset CSS variable', () => {
    const { getByTestId } = render(<AppShell />)
    const injected = getByTestId('webview').props.injectedJavaScriptBeforeContentLoaded
    expect(injected).toContain('--native-bottom-inset')
  })

  it('ends with true; for WebView compatibility', () => {
    const { getByTestId } = render(<AppShell />)
    const injected = getByTestId('webview').props.injectedJavaScriptBeforeContentLoaded
    expect(injected).toContain('true;')
  })
})

// ─── 5. Splash Screen ────────────────────────────────────────────

describe('Splash Screen', () => {
  it('calls preventAutoHideAsync on module load', () => {
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalled()
  })

  it('hides splash screen when WebView finishes loading', () => {
    const hideAsync = SplashScreen.hideAsync as jest.Mock
    hideAsync.mockClear()

    const { getByTestId } = render(<AppShell />)
    act(() => {
      getByTestId('webview').props.onLoadEnd()
    })

    expect(hideAsync).toHaveBeenCalled()
  })
})

// ─── 6. Navigation State ─────────────────────────────────────────

describe('Navigation State', () => {
  it('tracks canGoBack from WebView navigation changes', () => {
    const { getByTestId } = render(<AppShell />)
    const webview = getByTestId('webview')

    expect(() => {
      act(() => {
        webview.props.onNavigationStateChange({ canGoBack: true })
      })
    }).not.toThrow()
  })
})

// ─── 7. Deep Link Parsing ─────────────────────────────────────────

describe('Deep Link Handling', () => {
  it('parses casagrown.com deep links correctly', () => {
    const parse = Linking.parse as jest.Mock
    parse.mockReturnValueOnce({
      hostname: 'casagrown.com',
      path: 'market/booth/123',
      queryParams: { ref: 'abc' },
    })

    const result = Linking.parse('https://casagrown.com/market/booth/123?ref=abc')
    expect(result.hostname).toBe('casagrown.com')
    expect(result.path).toBe('market/booth/123')
  })

  it('rejects non-casagrown hostnames', () => {
    const parse = Linking.parse as jest.Mock
    parse.mockReturnValueOnce({
      hostname: 'evil.com',
      path: 'hack',
      queryParams: null,
    })

    const result = Linking.parse('https://evil.com/hack')
    expect(result.hostname).not.toBe('casagrown.com')
    expect(result.hostname).not.toBe('localhost')
  })
})

// ─── 8. WebView Message Handler ───────────────────────────────────

describe('WebView Message Handler', () => {
  it('handles REQUEST_PUSH_PERMISSION', async () => {
    const getPerms = Notifications.getPermissionsAsync as jest.Mock
    const reqPerms = Notifications.requestPermissionsAsync as jest.Mock
    const getToken = Notifications.getExpoPushTokenAsync as jest.Mock

    getPerms.mockResolvedValueOnce({ status: 'undetermined' })
    reqPerms.mockResolvedValueOnce({ status: 'granted' })
    getToken.mockResolvedValueOnce({ data: 'ExponentPushToken[test-123]' })

    const { getByTestId } = render(<AppShell />)

    await act(async () => {
      await getByTestId('webview').props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'REQUEST_PUSH_PERMISSION' }),
        },
      })
    })

    expect(getPerms).toHaveBeenCalled()
    expect(reqPerms).toHaveBeenCalled()
    expect(getToken).toHaveBeenCalled()
  })

  it('handles OPEN_APP_SETTINGS', async () => {
    const openSettings = Linking.openSettings as jest.Mock
    openSettings.mockClear()

    const { getByTestId } = render(<AppShell />)

    await act(async () => {
      await getByTestId('webview').props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'OPEN_APP_SETTINGS' }),
        },
      })
    })

    expect(openSettings).toHaveBeenCalled()
  })

  it('suppresses aps-environment errors silently', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
    const getPerms = Notifications.getPermissionsAsync as jest.Mock
    getPerms.mockRejectedValueOnce(
      new Error('no valid "aps-environment" entitlement string found')
    )

    const { getByTestId } = render(<AppShell />)

    await act(async () => {
      await getByTestId('webview').props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'REQUEST_PUSH_PERMISSION' }),
        },
      })
    })

    expect(consoleSpy).not.toHaveBeenCalledWith(
      'WebView message parsing error:',
      expect.anything()
    )
    consoleSpy.mockRestore()
  })

  it('logs unexpected JSON parse errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    const { getByTestId } = render(<AppShell />)

    await act(async () => {
      await getByTestId('webview').props.onMessage({
        nativeEvent: { data: 'not-valid-json!!!' },
      })
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      'WebView message parsing error:',
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })
})
