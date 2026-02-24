/**
 * useAppPresence Tests
 *
 * Tests the root-level presence provider:
 * - Subscribes/unsubscribes on visibility changes
 * - Tracks online users via Supabase presence
 * - useIsOnline returns correct boolean for user IDs
 */

import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { AppPresenceProvider, useIsOnline, useOnlineUsers } from "./useAppPresence";

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

const mockTrack = jest.fn().mockResolvedValue(undefined);
const mockUntrack = jest.fn();
const mockRemoveChannel = jest.fn();
const mockPresenceState = jest.fn().mockReturnValue({});

type PresenceCallback = (args: any) => void;
const presenceListeners = new Map<string, PresenceCallback>();

const mockChannel: any = {
    on: jest.fn(function (
        this: any,
        type: string,
        opts: any,
        callback: PresenceCallback,
    ) {
        const key = `${type}:${opts.event}`;
        presenceListeners.set(key, callback);
        return mockChannel;
    }),
    subscribe: jest.fn(function (callback?: Function) {
        if (callback) callback("SUBSCRIBED");
        return mockChannel;
    }),
    track: mockTrack,
    untrack: mockUntrack,
    presenceState: mockPresenceState,
};

jest.mock("../features/auth/auth-hook", () => ({
    supabase: {
        channel: jest.fn(() => mockChannel),
        removeChannel: (...args: any[]) => mockRemoveChannel(...args),
    },
}));

// Mock AppState — we'll override addEventListener in individual tests
let appStateCallback: ((state: string) => void) | null = null;
const mockRemoveSub = jest.fn();
jest.spyOn(AppState, "addEventListener").mockImplementation(
    (_event: string, handler: any) => {
        appStateCallback = handler;
        return { remove: mockRemoveSub } as any;
    },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
    return (
        <AppPresenceProvider userId="user-me">
            {children}
        </AppPresenceProvider>
    );
}

function wrapperNoUser({ children }: { children: React.ReactNode }) {
    return (
        <AppPresenceProvider userId={undefined}>
            {children}
        </AppPresenceProvider>
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.clearAllMocks();
    presenceListeners.clear();
    appStateCallback = null;
    mockPresenceState.mockReturnValue({});
    // Re-establish mock implementations after clearAllMocks
    mockTrack.mockResolvedValue(undefined);
    mockChannel.on.mockImplementation(function (
        type: string,
        opts: any,
        callback: PresenceCallback,
    ) {
        const key = `${type}:${opts.event}`;
        presenceListeners.set(key, callback);
        return mockChannel;
    });
    mockChannel.subscribe.mockImplementation(function (callback?: Function) {
        if (callback) callback("SUBSCRIBED");
        return mockChannel;
    });
});

describe("AppPresenceProvider", () => {
    it("subscribes to presence channel on mount with userId", () => {
        renderHook(() => useOnlineUsers(), { wrapper });

        expect(mockChannel.subscribe).toHaveBeenCalled();
        expect(mockTrack).toHaveBeenCalledWith({ online: true });
    });

    it("does not subscribe when userId is undefined", () => {
        renderHook(() => useOnlineUsers(), { wrapper: wrapperNoUser });

        expect(mockChannel.subscribe).not.toHaveBeenCalled();
    });

    it("cleans up channel on unmount", () => {
        const { unmount } = renderHook(() => useOnlineUsers(), { wrapper });

        unmount();

        expect(mockUntrack).toHaveBeenCalled();
        expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it("tracks online users from presence sync", () => {
        const { result } = renderHook(() => useOnlineUsers(), { wrapper });

        // Simulate presence sync with two other users online
        const syncHandler = presenceListeners.get("presence:sync");
        mockPresenceState.mockReturnValue({
            "user-alice": [{ online: true }],
            "user-bob": [{ online: true }],
            "user-me": [{ online: true }], // own user — should be excluded
        });

        act(() => {
            syncHandler?.({});
        });

        expect(result.current.size).toBe(2);
        expect(result.current.has("user-alice")).toBe(true);
        expect(result.current.has("user-bob")).toBe(true);
        expect(result.current.has("user-me")).toBe(false);
    });

    it("adds user on presence join", () => {
        const { result } = renderHook(() => useOnlineUsers(), { wrapper });

        const joinHandler = presenceListeners.get("presence:join");

        act(() => {
            joinHandler?.({ key: "user-alice" });
        });

        expect(result.current.has("user-alice")).toBe(true);
    });

    it("removes user on presence leave", () => {
        const { result } = renderHook(() => useOnlineUsers(), { wrapper });

        // First join
        const joinHandler = presenceListeners.get("presence:join");
        act(() => {
            joinHandler?.({ key: "user-alice" });
        });
        expect(result.current.has("user-alice")).toBe(true);

        // Then leave
        const leaveHandler = presenceListeners.get("presence:leave");
        act(() => {
            leaveHandler?.({ key: "user-alice" });
        });
        expect(result.current.has("user-alice")).toBe(false);
    });

    it("ignores own join events", () => {
        const { result } = renderHook(() => useOnlineUsers(), { wrapper });

        const joinHandler = presenceListeners.get("presence:join");
        act(() => {
            joinHandler?.({ key: "user-me" });
        });

        expect(result.current.has("user-me")).toBe(false);
    });
});

describe("useIsOnline", () => {
    it("returns true for online users", () => {
        const { result } = renderHook(() => useIsOnline("user-alice"), { wrapper });

        // Initially false
        expect(result.current).toBe(false);

        // Simulate join
        const joinHandler = presenceListeners.get("presence:join");
        act(() => {
            joinHandler?.({ key: "user-alice" });
        });

        expect(result.current).toBe(true);
    });

    it("returns false for offline users", () => {
        const { result } = renderHook(() => useIsOnline("user-unknown"), { wrapper });

        expect(result.current).toBe(false);
    });

    it("returns false when userId is undefined", () => {
        const { result } = renderHook(() => useIsOnline(undefined), { wrapper });

        expect(result.current).toBe(false);
    });
});

describe("visibility-aware connect/disconnect", () => {
    it("unsubscribes when app goes to background (native)", () => {
        renderHook(() => useOnlineUsers(), { wrapper });

        // Simulate backgrounding
        expect(appStateCallback).not.toBeNull();
        act(() => {
            appStateCallback?.("background");
        });

        expect(mockUntrack).toHaveBeenCalled();
        expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it("Initial subscribe", () => {
        renderHook(() => useOnlineUsers(), { wrapper });

        expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);

        // Background
        act(() => {
            appStateCallback?.("background");
        });

        // Foreground again
        act(() => {
            appStateCallback?.("active");
        });

        // Should have subscribed again
        expect(mockChannel.subscribe).toHaveBeenCalledTimes(2);
    });

    it("registers AppState listener and cleans up on unmount", () => {
        const { unmount } = renderHook(() => useOnlineUsers(), { wrapper });

        expect(AppState.addEventListener).toHaveBeenCalledWith(
            "change",
            expect.any(Function),
        );

        unmount();

        expect(mockRemoveSub).toHaveBeenCalled();
    });
});
