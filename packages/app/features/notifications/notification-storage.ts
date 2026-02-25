/**
 * Notification Permission Prompt — Storage Layer
 *
 * Persists prompt state (dismissed, opted-out, cooldown) using
 * the same localStorage / AsyncStorage pattern as feed-cache.ts.
 *
 * Keys stored:
 *   casagrown_notif_dismissed_at  — ISO timestamp of last "Not now" / "Remind me later"
 *   casagrown_notif_opted_out     — "true" if user chose "No thanks"
 *   (session-only flag is in-memory, not persisted)
 */

import { Platform } from "react-native";

// =============================================================================
// Storage Abstraction (mirrors feed-cache.ts)
// =============================================================================

async function storageGet(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }
    const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
    return AsyncStorage.getItem(key);
}

async function storageSet(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
        try {
            localStorage.setItem(key, value);
        } catch {
            // localStorage full or unavailable
        }
        return;
    }
    const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
    await AsyncStorage.setItem(key, value);
}

// =============================================================================
// Constants
// =============================================================================

const DISMISSED_AT_KEY = "casagrown_notif_dismissed_at";
const OPTED_OUT_KEY = "casagrown_notif_opted_out";
const RE_PROMPT_DAYS = 7;

// Session-only guard (resets on app/page reload)
let promptedThisSession = false;

// =============================================================================
// Public API
// =============================================================================

/** Mark that we've already shown the prompt this session */
export function setPromptedThisSession(): void {
    promptedThisSession = true;
}

/** Was the prompt already shown this session? */
export function wasPromptedThisSession(): boolean {
    return promptedThisSession;
}

/** User tapped "Not now" / "Remind me later" → 7-day cooldown */
export async function setDismissed(): Promise<void> {
    promptedThisSession = true;
    await storageSet(DISMISSED_AT_KEY, new Date().toISOString());
}

/** User tapped "No thanks, I don't need notifications" → never again */
export async function setPermanentOptOut(): Promise<void> {
    promptedThisSession = true;
    await storageSet(OPTED_OUT_KEY, "true");
}

/**
 * Should we show the notification prompt?
 *
 * Returns false if:
 *   - Already prompted this session
 *   - User permanently opted out
 *   - Dismissed within the last 7 days
 *   - Permission is already 'granted'
 */
export async function shouldShowPrompt(): Promise<boolean> {
    // 1. Session guard
    if (promptedThisSession) return false;

    // 2. Permanent opt-out
    const optedOut = await storageGet(OPTED_OUT_KEY);
    if (optedOut === "true") return false;

    // 3. Check if permission is already granted (web)
    if (Platform.OS === "web" && typeof Notification !== "undefined") {
        if (Notification.permission === "granted") return false;
    }

    // 4. 7-day cooldown from last dismissal
    const dismissedAt = await storageGet(DISMISSED_AT_KEY);
    if (dismissedAt) {
        const dismissDate = new Date(dismissedAt);
        const now = new Date();
        const daysSince = (now.getTime() - dismissDate.getTime()) /
            (1000 * 60 * 60 * 24);
        if (daysSince < RE_PROMPT_DAYS) return false;
    }

    return true;
}
