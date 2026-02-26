/**
 * Notification Service — Platform Detection, Permission, Token Registration
 *
 * Handles the cross-platform differences:
 *   - Web: Notification API + Service Worker Push Subscription
 *   - iOS Safari/Chrome browser: Detects need for PWA install
 *   - Native iOS/Android: expo-notifications (stub — TODO for release)
 */

import { Platform } from "react-native";
import { supabase } from "../auth/auth-hook";

// =============================================================================
// Types
// =============================================================================

export type NotifPlatform =
    | "desktop-web"
    | "ios-safari-browser"
    | "ios-chrome-browser"
    | "ios-pwa"
    | "android-web"
    | "native-ios"
    | "native-android";

export type PermissionStatus = "granted" | "denied" | "default" | "unsupported";

// =============================================================================
// VAPID Public Key (set via env — generated with `npx web-push generate-vapid-keys`)
// =============================================================================

const VAPID_PUBLIC_KEY = typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "")
    : "";

// =============================================================================
// Platform Detection
// =============================================================================

export function detectPlatform(): NotifPlatform {
    if (Platform.OS === "ios") return "native-ios";
    if (Platform.OS === "android") return "native-android";

    // Web platform detection
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
        const ua = navigator.userAgent;

        // iOS device detection
        const isIOS = /iPad|iPhone|iPod/.test(ua) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

        if (isIOS) {
            // Check if running as installed PWA (standalone mode)
            const isStandalone =
                ("standalone" in navigator && (navigator as any).standalone) ||
                window.matchMedia("(display-mode: standalone)").matches;

            if (isStandalone) return "ios-pwa";

            // Detect browser type
            const isChrome = /CriOS/.test(ua);
            return isChrome ? "ios-chrome-browser" : "ios-safari-browser";
        }

        // Android browser
        if (/Android/.test(ua)) return "android-web";
    }

    return "desktop-web";
}

// =============================================================================
// Permission Status
// =============================================================================

export function getPermissionStatus(): PermissionStatus {
    if (Platform.OS === "web") {
        if (typeof Notification === "undefined") return "unsupported";
        return Notification.permission as PermissionStatus;
    }

    // TODO [NATIVE]: Use expo-notifications to check permission
    // import * as Notifications from 'expo-notifications'
    // const { status } = await Notifications.getPermissionsAsync()
    // return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'default'
    return "unsupported";
}

/**
 * Determine which modal variant to show based on platform + permission state.
 */
export function getPromptVariant():
    | "first-time"
    | "denied"
    | "ios-safari"
    | "ios-chrome"
    | "none" {
    const platform = detectPlatform();
    const permission = getPermissionStatus();

    // Already granted — don't show any prompt
    if (permission === "granted") return "none";

    // iOS browsers → PWA guide (shows INSTEAD of notification prompt)
    if (platform === "ios-safari-browser") return "ios-safari";
    if (platform === "ios-chrome-browser") return "ios-chrome";

    // iOS PWA → treat like any other web context
    // (it has Notification API available)

    // Permission was previously denied → show settings guide
    if (permission === "denied") return "denied";

    // Default state → first-time prompt
    return "first-time";
}

// =============================================================================
// Web Push Subscription
// =============================================================================

/**
 * Request notification permission and subscribe to web push.
 * Returns the PushSubscription on success, null on denial/failure.
 */
export async function requestWebPushPermission(): Promise<
    PushSubscription | null
> {
    if (
        typeof Notification === "undefined" || !("serviceWorker" in navigator)
    ) {
        return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                .buffer as ArrayBuffer,
        });
        return subscription;
    } catch (err) {
        console.error("[NotificationService] Push subscription failed:", err);
        if (Platform.OS === "web") {
            window.alert(
                "[NotificationService] Push subscription failed:\n\n" +
                    String(err),
            );
        }
        return null;
    }
}

// =============================================================================
// Token Registration
// =============================================================================

/**
 * Register a push token/subscription with the backend.
 */
export async function registerPushToken(
    userId: string,
    platform: "web" | "ios" | "android",
    token: string,
    endpoint?: string,
): Promise<void> {
    try {
        const { error } = await supabase.functions.invoke(
            "register-push-token",
            {
                body: { token, platform, endpoint },
            },
        );
        if (error) {
            console.error(
                "[NotificationService] Token registration failed:",
                error,
            );
        }
    } catch (err) {
        console.error("[NotificationService] Token registration error:", err);
    }
}

/**
 * Complete web push flow: request permission → subscribe → register token.
 */
export async function enableWebPush(userId: string): Promise<boolean> {
    const subscription = await requestWebPushPermission();
    if (!subscription) return false;

    await registerPushToken(
        userId,
        "web",
        JSON.stringify(subscription.toJSON()),
        subscription.endpoint,
    );
    return true;
}

// =============================================================================
// Native Push — Full implementation (requires `npx expo install expo-notifications`)
//
// RELEASE READINESS:
//   iOS:     Set APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY in Supabase secrets
//   Android: Set FCM_SERVER_KEY in Supabase secrets, add google-services.json
//   Both:    npx expo install expo-notifications && npx expo prebuild --clean
// =============================================================================

/**
 * Request iOS notification permission and register push token.
 * Gracefully returns false if expo-notifications is not installed.
 */
export async function enableIOSPush(userId: string): Promise<boolean> {
    // Only runs on native — never bundled for web
    if (Platform.OS === "web") return false;
    try {
        // eslint-disable-next-line no-eval -- eval() hides module from Turbopack/webpack static analysis
        const Notifications = eval("require")("expo-notifications");

        const { status: existingStatus } = await Notifications
            .getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== "granted") {
            console.warn("[NotificationService] iOS permission not granted");
            return false;
        }

        // Get the Expo push token (or native APNs token)
        const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: undefined, // Uses the project ID from app.json
        });

        await registerPushToken(userId, "ios", tokenData.data);
        console.log("[NotificationService] iOS push token registered");
        return true;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (
            message.includes("Cannot find module") ||
            message.includes("expo-notifications")
        ) {
            console.warn(
                "[NotificationService] expo-notifications not installed — run: npx expo install expo-notifications",
            );
        } else {
            console.error("[NotificationService] iOS push setup failed:", err);
        }
        return false;
    }
}

/**
 * Request Android notification permission and register push token.
 * Gracefully returns false if expo-notifications is not installed.
 * Android 13+ requires explicit notification permission.
 */
export async function enableAndroidPush(userId: string): Promise<boolean> {
    // Only runs on native — never bundled for web
    if (Platform.OS === "web") return false;
    try {
        // eslint-disable-next-line no-eval -- eval() hides module from Turbopack/webpack static analysis
        const Notifications = eval("require")("expo-notifications");

        // Android requires a notification channel
        await Notifications.setNotificationChannelAsync("default", {
            name: "CasaGrown",
            importance: 4, // MAX importance
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#16a34a",
        });

        const { status: existingStatus } = await Notifications
            .getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== "granted") {
            console.warn(
                "[NotificationService] Android permission not granted",
            );
            return false;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: undefined,
        });

        await registerPushToken(userId, "android", tokenData.data);
        console.log("[NotificationService] Android push token registered");
        return true;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (
            message.includes("Cannot find module") ||
            message.includes("expo-notifications")
        ) {
            console.warn(
                "[NotificationService] expo-notifications not installed — run: npx expo install expo-notifications",
            );
        } else {
            console.error(
                "[NotificationService] Android push setup failed:",
                err,
            );
        }
        return false;
    }
}

// =============================================================================
// Helpers
// =============================================================================

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(
        /_/g,
        "/",
    );
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
