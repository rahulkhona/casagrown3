/**
 * Tests for notification-service.ts — platform detection and prompt variant.
 */

// Mock Platform
let mockPlatformOS: string = "web";
jest.mock("react-native", () => ({
    Platform: {
        get OS() {
            return mockPlatformOS;
        },
    },
}));

// Mock supabase
jest.mock("../auth/auth-hook", () => ({
    supabase: {
        functions: {
            invoke: jest.fn().mockResolvedValue({ error: null }),
        },
    },
}));

import {
    detectPlatform,
    getPermissionStatus,
    getPromptVariant,
} from "./notification-service";

beforeEach(() => {
    jest.clearAllMocks();
    mockPlatformOS = "web";

    // Default: desktop browser
    Object.defineProperty(globalThis, "navigator", {
        value: {
            userAgent:
                "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120.0",
            platform: "MacIntel",
            maxTouchPoints: 0,
        },
        writable: true,
        configurable: true,
    });

    Object.defineProperty(globalThis, "window", {
        value: {
            matchMedia: jest.fn().mockReturnValue({ matches: false }),
        },
        writable: true,
        configurable: true,
    });

    Object.defineProperty(globalThis, "Notification", {
        value: { permission: "default" },
        writable: true,
        configurable: true,
    });
});

// =============================================================================
// detectPlatform
// =============================================================================

describe("detectPlatform", () => {
    it("returns desktop-web for standard desktop browser", () => {
        expect(detectPlatform()).toBe("desktop-web");
    });

    it("returns native-ios for React Native iOS", () => {
        mockPlatformOS = "ios";
        expect(detectPlatform()).toBe("native-ios");
    });

    it("returns native-android for React Native Android", () => {
        mockPlatformOS = "android";
        expect(detectPlatform()).toBe("native-android");
    });

    it("returns ios-safari-browser for iPhone Safari", () => {
        (globalThis as any).navigator = {
            userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            platform: "iPhone",
            maxTouchPoints: 5,
        };
        (globalThis as any).window = {
            matchMedia: jest.fn().mockReturnValue({ matches: false }),
        };
        expect(detectPlatform()).toBe("ios-safari-browser");
    });

    it("returns ios-chrome-browser for iPhone Chrome", () => {
        (globalThis as any).navigator = {
            userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1",
            platform: "iPhone",
            maxTouchPoints: 5,
        };
        (globalThis as any).window = {
            matchMedia: jest.fn().mockReturnValue({ matches: false }),
        };
        expect(detectPlatform()).toBe("ios-chrome-browser");
    });

    it("returns ios-pwa for iOS standalone mode", () => {
        (globalThis as any).navigator = {
            userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15",
            platform: "iPhone",
            maxTouchPoints: 5,
            standalone: true,
        };
        (globalThis as any).window = {
            matchMedia: jest.fn().mockReturnValue({ matches: false }),
        };
        expect(detectPlatform()).toBe("ios-pwa");
    });

    it("returns android-web for Android browser", () => {
        (globalThis as any).navigator = {
            userAgent:
                "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0",
            platform: "Linux armv8l",
            maxTouchPoints: 5,
        };
        expect(detectPlatform()).toBe("android-web");
    });

    it("detects iPad as iOS via maxTouchPoints", () => {
        (globalThis as any).navigator = {
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
            platform: "MacIntel",
            maxTouchPoints: 5, // iPad reports as MacIntel with touch
        };
        (globalThis as any).window = {
            matchMedia: jest.fn().mockReturnValue({ matches: false }),
        };
        expect(detectPlatform()).toBe("ios-safari-browser");
    });
});

// =============================================================================
// getPermissionStatus
// =============================================================================

describe("getPermissionStatus", () => {
    it('returns "default" when Notification.permission is default', () => {
        (globalThis as any).Notification = { permission: "default" };
        expect(getPermissionStatus()).toBe("default");
    });

    it('returns "granted" when Notification.permission is granted', () => {
        (globalThis as any).Notification = { permission: "granted" };
        expect(getPermissionStatus()).toBe("granted");
    });

    it('returns "denied" when Notification.permission is denied', () => {
        (globalThis as any).Notification = { permission: "denied" };
        expect(getPermissionStatus()).toBe("denied");
    });

    it('returns "unsupported" when Notification API is not available', () => {
        (globalThis as any).Notification = undefined;
        expect(getPermissionStatus()).toBe("unsupported");
    });

    it('returns "unsupported" on native platform', () => {
        mockPlatformOS = "ios";
        expect(getPermissionStatus()).toBe("unsupported");
    });
});

// =============================================================================
// getPromptVariant
// =============================================================================

describe("getPromptVariant", () => {
    it('returns "first-time" on desktop with default permission', () => {
        (globalThis as any).Notification = { permission: "default" };
        expect(getPromptVariant()).toBe("first-time");
    });

    it('returns "none" when permission is already granted', () => {
        (globalThis as any).Notification = { permission: "granted" };
        expect(getPromptVariant()).toBe("none");
    });

    it('returns "denied" when permission was denied on desktop', () => {
        (globalThis as any).Notification = { permission: "denied" };
        expect(getPromptVariant()).toBe("denied");
    });

    it('returns "ios-safari" for iPhone Safari browser', () => {
        (globalThis as any).navigator = {
            userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1",
            platform: "iPhone",
            maxTouchPoints: 5,
        };
        (globalThis as any).window = {
            matchMedia: jest.fn().mockReturnValue({ matches: false }),
        };
        (globalThis as any).Notification = { permission: "default" };
        expect(getPromptVariant()).toBe("ios-safari");
    });

    it('returns "ios-chrome" for iPhone Chrome browser', () => {
        (globalThis as any).navigator = {
            userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 CriOS/120.0 Safari/604.1",
            platform: "iPhone",
            maxTouchPoints: 5,
        };
        (globalThis as any).window = {
            matchMedia: jest.fn().mockReturnValue({ matches: false }),
        };
        (globalThis as any).Notification = { permission: "default" };
        expect(getPromptVariant()).toBe("ios-chrome");
    });

    it('returns "first-time" for iOS PWA (has Notification API)', () => {
        (globalThis as any).navigator = {
            userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15",
            platform: "iPhone",
            maxTouchPoints: 5,
            standalone: true,
        };
        (globalThis as any).window = {
            matchMedia: jest.fn().mockReturnValue({ matches: false }),
        };
        (globalThis as any).Notification = { permission: "default" };
        expect(getPromptVariant()).toBe("first-time");
    });
});
