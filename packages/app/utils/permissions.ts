/**
 * Shared Permission Utilities
 *
 * Cross-platform helpers for:
 *   - Dynamic app name detection (Expo Go vs CasaGrown)
 *   - Opening device settings for permission re-grant
 *   - Showing localized "permission denied → Open Settings" alerts
 *
 * All functions are web-safe (no-ops or fallbacks on web).
 */

import { Alert, Linking, Platform } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import type { TFunction } from 'i18next'

// =============================================================================
// App Display Name
// =============================================================================

/**
 * Returns the correct app name for permission instructions.
 *
 * - In Expo Go (development): returns 'Expo Go'
 * - In standalone/production: returns 'CasaGrown'
 * - On web: always returns 'CasaGrown' (no Expo Go on web)
 */
export function getAppDisplayName(): string {
  if (Platform.OS === 'web') return 'CasaGrown'

  try {
    // executionEnvironment is 'storeClient' when running inside Expo Go
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return 'Expo Go'
    }
  } catch {
    // expo-constants may not be available in some web bundler contexts
  }

  return 'CasaGrown'
}

// =============================================================================
// Open Device Settings
// =============================================================================

/**
 * Opens the device's app settings page where users can re-enable permissions.
 *
 * - iOS:     Opens `app-settings:` (goes directly to this app's settings)
 * - Android: Calls `Linking.openSettings()` (opens app info page)
 * - Web:     No-op (browsers don't expose a settings API)
 */
export async function openAppSettings(): Promise<void> {
  if (Platform.OS === 'web') return

  try {
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:')
    } else {
      await Linking.openSettings()
    }
  } catch (err) {
    console.warn('[permissions] Failed to open settings:', err)
  }
}

// =============================================================================
// Permission Denied Alert
// =============================================================================

type PermissionType = 'camera' | 'location'

/**
 * Shows a localized alert when a permission is denied, with an "Open Settings"
 * button that navigates directly to device settings.
 *
 * Adapts the message based on `canAskAgain`:
 *   - true:  Soft denial — permission was dismissed or denied once
 *   - false: Permanent denial — must go to settings to re-enable
 *
 * On web: no-op (web handles permissions via browser dialogs).
 *
 * @param type      - 'camera' or 'location'
 * @param t         - i18next translation function
 * @param canAskAgain - from the permission response object
 */
export function showPermissionDeniedAlert(
  type: PermissionType,
  t: TFunction | ((key: string, opts?: Record<string, unknown>) => string),
  canAskAgain = true,
): void {
  // On web, permissions are handled by the browser — don't show native alerts
  if (Platform.OS === 'web') return

  const title = t(`permissions.${type}.deniedTitle`)
  const message = canAskAgain
    ? t(`permissions.${type}.deniedMessage`)
    : t(`permissions.${type}.blockedMessage`, {
        appName: getAppDisplayName(),
      })

  const buttons: Array<{ text: string; style?: 'cancel' | 'default'; onPress?: () => void }> = [
    { text: t('permissions.cancel'), style: 'cancel' },
  ]

  // Only show "Open Settings" when the permission is permanently blocked
  // (canAskAgain=false) since the system dialog won't appear again
  if (!canAskAgain) {
    buttons.push({
      text: t('permissions.openSettings'),
      onPress: () => openAppSettings(),
    })
  }

  Alert.alert(title, message, buttons)
}
