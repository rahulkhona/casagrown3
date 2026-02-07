/**
 * OTA Update Hook
 *
 * Checks for Expo OTA updates in two scenarios:
 * 1. On app foreground resume (AppState background → active)
 * 2. On a periodic timer for long-lived sessions
 *
 * In development mode, this hook is a no-op since OTA updates
 * only work in production builds.
 *
 * Behavior:
 * - Silently downloads the update in the background
 * - Reloads the app to apply (appears as a brief refresh)
 * - Catches and silently handles all errors to never disrupt UX
 */
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

// Only import expo-updates on native (it's not available on web)
const Updates = Platform.OS !== "web" ? require("expo-updates") : null;

/** Minimum seconds between update checks to avoid hammering the server */
const MIN_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** Periodic check interval for long-lived sessions */
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function useOTAUpdates() {
    const lastCheckRef = useRef<number>(0);
    const isCheckingRef = useRef<boolean>(false);

    useEffect(() => {
        // No-op in development or on web
        if (__DEV__ || !Updates) return;

        const checkForUpdate = async () => {
            // Debounce: don't check more often than MIN_CHECK_INTERVAL_MS
            const now = Date.now();
            if (now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
            if (isCheckingRef.current) return;

            isCheckingRef.current = true;
            lastCheckRef.current = now;

            try {
                const update = await Updates.checkForUpdateAsync();
                if (update.isAvailable) {
                    const result = await Updates.fetchUpdateAsync();
                    if (result.isNew) {
                        // Reload to apply — appears as a brief app refresh
                        await Updates.reloadAsync();
                    }
                }
            } catch (e) {
                // Silently fail — never disrupt the user experience
                // Common failures: no network, server unreachable, etc.
            } finally {
                isCheckingRef.current = false;
            }
        };

        // Check on foreground resume
        const subscription = AppState.addEventListener(
            "change",
            (nextState) => {
                if (nextState === "active") {
                    checkForUpdate();
                }
            },
        );

        // Periodic check for long-lived sessions
        const interval = setInterval(
            checkForUpdate,
            PERIODIC_CHECK_INTERVAL_MS,
        );

        return () => {
            subscription.remove();
            clearInterval(interval);
        };
    }, []);
}
