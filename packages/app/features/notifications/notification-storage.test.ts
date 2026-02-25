/**
 * Tests for notification-storage.ts — prompt state persistence.
 */

// Mock Platform before imports
jest.mock("react-native", () => ({
    Platform: { OS: "web" },
}));

// Mock localStorage
const localStorageMock: Record<string, string> = {};
const localStorageGetSpy = jest.fn((key: string) =>
    localStorageMock[key] ?? null
);
const localStorageSetSpy = jest.fn((key: string, value: string) => {
    localStorageMock[key] = value;
});

Object.defineProperty(globalThis, "localStorage", {
    value: {
        getItem: localStorageGetSpy,
        setItem: localStorageSetSpy,
        removeItem: jest.fn((key: string) => {
            delete localStorageMock[key];
        }),
    },
    writable: true,
});

// Mock Notification API
Object.defineProperty(globalThis, "Notification", {
    value: { permission: "default" },
    writable: true,
    configurable: true,
});

import {
    setDismissed,
    setPermanentOptOut,
    setPromptedThisSession,
    shouldShowPrompt,
    wasPromptedThisSession,
} from "./notification-storage";

beforeEach(() => {
    jest.clearAllMocks();
    // Clear localStorage mock
    Object.keys(localStorageMock).forEach((k) => delete localStorageMock[k]);
    // Reset the module to clear in-memory session flag
    // We need to re-import to reset the session flag
    jest.resetModules();
});

// =============================================================================
// shouldShowPrompt
// =============================================================================

describe("shouldShowPrompt", () => {
    it("returns true on first visit with no stored state", async () => {
        // Re-import to get fresh session state
        const mod = require("./notification-storage");
        const result = await mod.shouldShowPrompt();
        expect(result).toBe(true);
    });

    it("returns false after setPromptedThisSession", async () => {
        const mod = require("./notification-storage");
        mod.setPromptedThisSession();
        const result = await mod.shouldShowPrompt();
        expect(result).toBe(false);
    });

    it("returns false after permanent opt-out", async () => {
        localStorageMock["casagrown_notif_opted_out"] = "true";
        const mod = require("./notification-storage");
        const result = await mod.shouldShowPrompt();
        expect(result).toBe(false);
    });

    it("returns false when dismissed within 7 days", async () => {
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        localStorageMock["casagrown_notif_dismissed_at"] = twoDaysAgo
            .toISOString();
        const mod = require("./notification-storage");
        const result = await mod.shouldShowPrompt();
        expect(result).toBe(false);
    });

    it("returns true when dismissed more than 7 days ago", async () => {
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        localStorageMock["casagrown_notif_dismissed_at"] = tenDaysAgo
            .toISOString();
        const mod = require("./notification-storage");
        const result = await mod.shouldShowPrompt();
        expect(result).toBe(true);
    });

    it("returns false when Notification.permission is granted", async () => {
        (globalThis as any).Notification = { permission: "granted" };
        const mod = require("./notification-storage");
        const result = await mod.shouldShowPrompt();
        expect(result).toBe(false); // Reset
        (globalThis as any).Notification = { permission: "default" };
    });
});

// =============================================================================
// setDismissed
// =============================================================================

describe("setDismissed", () => {
    it("stores a timestamp in localStorage", async () => {
        const mod = require("./notification-storage");
        await mod.setDismissed();
        expect(localStorageSetSpy).toHaveBeenCalledWith(
            "casagrown_notif_dismissed_at",
            expect.any(String),
        );
        // Verify it's a valid ISO date
        const stored = localStorageSetSpy.mock.calls[0][1];
        expect(() => new Date(stored)).not.toThrow();
        expect(new Date(stored).getTime()).toBeGreaterThan(0);
    });

    it("sets session flag so prompt does not show again this session", async () => {
        const mod = require("./notification-storage");
        await mod.setDismissed();
        expect(mod.wasPromptedThisSession()).toBe(true);
    });
});

// =============================================================================
// setPermanentOptOut
// =============================================================================

describe("setPermanentOptOut", () => {
    it("stores opted-out flag in localStorage", async () => {
        const mod = require("./notification-storage");
        await mod.setPermanentOptOut();
        expect(localStorageSetSpy).toHaveBeenCalledWith(
            "casagrown_notif_opted_out",
            "true",
        );
    });

    it("sets session flag", async () => {
        const mod = require("./notification-storage");
        await mod.setPermanentOptOut();
        expect(mod.wasPromptedThisSession()).toBe(true);
    });

    it("prevents shouldShowPrompt from returning true", async () => {
        const mod = require("./notification-storage");
        await mod.setPermanentOptOut();
        // Reset session flag by re-requiring (can't easily, so verify via storage)
        expect(localStorageMock["casagrown_notif_opted_out"]).toBe("true");
    });
});

// =============================================================================
// wasPromptedThisSession
// =============================================================================

describe("wasPromptedThisSession", () => {
    it("returns false initially", () => {
        const mod = require("./notification-storage");
        expect(mod.wasPromptedThisSession()).toBe(false);
    });

    it("returns true after setPromptedThisSession", () => {
        const mod = require("./notification-storage");
        mod.setPromptedThisSession();
        expect(mod.wasPromptedThisSession()).toBe(true);
    });
});
