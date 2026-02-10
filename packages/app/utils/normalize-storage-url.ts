import { Platform } from "react-native";

/**
 * Normalizes Supabase storage URLs for the current platform.
 *
 * Problem: URLs stored in the DB use `127.0.0.1` (the host machine's localhost).
 * On Android emulator, `127.0.0.1` points to the emulator itself, not the host.
 * Android emulator uses `10.0.2.2` to reach the host machine.
 *
 * This function rewrites the URL so images/media load correctly on all platforms.
 */
export function normalizeStorageUrl(
    url: string | null | undefined,
): string | undefined {
    if (!url) return undefined;

    if (Platform.OS === "android") {
        return url
            .replace("http://127.0.0.1:", "http://10.0.2.2:")
            .replace("http://localhost:", "http://10.0.2.2:");
    }

    if (Platform.OS === "ios") {
        return url
            .replace("http://127.0.0.1:", "http://localhost:")
            .replace("http://10.0.2.2:", "http://localhost:");
    }

    return url;
}
