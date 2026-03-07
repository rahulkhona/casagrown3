import { Linking, Platform } from "react-native";

/**
 * Community Voice app URL — used for "Contact Support" links.
 * Users can submit feedback without accepting the community app ToS.
 */
const COMMUNITY_VOICE_URL = __DEV__
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
