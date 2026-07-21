import { Linking, Platform } from "react-native";

/**
 * Gets the base application URL for deep linking, QR code payloads, and web routes.
 * Priority:
 * 1. process.env.NEXT_PUBLIC_SITE_URL or SITE_URL / NEXT_PUBLIC_APP_URL / EXPO_PUBLIC_APP_URL
 * 2. window.location.origin (when running in web browser)
 * 3. http://localhost:3000 (when running in local development / __DEV__)
 * 4. https://casagrown.com (production default fallback)
 */
export function getBaseAppUrl(): string {
    if (process.env.NEXT_PUBLIC_SITE_URL) {
        return process.env.NEXT_PUBLIC_SITE_URL;
    }
    if (process.env.SITE_URL) {
        return process.env.SITE_URL;
    }
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }
    if (process.env.EXPO_PUBLIC_APP_URL) {
        return process.env.EXPO_PUBLIC_APP_URL;
    }
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location && window.location.origin) {
        return window.location.origin;
    }
    if (typeof __DEV__ !== "undefined" && __DEV__) {
        return "http://localhost:3000";
    }
    return "https://casagrown.com";
}

/**
 * Community Voice app URL — used for "Contact Support" links.
 * Users can submit feedback without accepting the community app ToS.
 */
const COMMUNITY_VOICE_URL = (typeof __DEV__ !== "undefined" && __DEV__)
    ? "http://localhost:3002"
    : "https://voice.casagrown.com";

/**
 * Opens the Community Voice feedback board.
 * Web: opens in a new tab. Mobile: opens in the default browser.
 */
export function openContactSupport() {
    const url = `${COMMUNITY_VOICE_URL}/board`;
    if (Platform.OS === "web") {
        window.open(url, "_blank");
    } else {
        Linking.openURL(url);
    }
}
