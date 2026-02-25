/**
 * Tests for useNotificationPrompt hook.
 */

// Mock Platform
jest.mock("react-native", () => ({
    Platform: { OS: "web" },
}));

// Mock notification-storage
const mockShouldShowPrompt = jest.fn().mockResolvedValue(true);
const mockSetDismissed = jest.fn().mockResolvedValue(undefined);
const mockSetPermanentOptOut = jest.fn().mockResolvedValue(undefined);
const mockSetPromptedThisSession = jest.fn();

jest.mock("./notification-storage", () => ({
    shouldShowPrompt: () => mockShouldShowPrompt(),
    setDismissed: () => mockSetDismissed(),
    setPermanentOptOut: () => mockSetPermanentOptOut(),
    setPromptedThisSession: () => mockSetPromptedThisSession(),
}));

// Mock notification-service
const mockGetPromptVariant = jest.fn().mockReturnValue("first-time");
const mockEnableWebPush = jest.fn().mockResolvedValue(true);
const mockDetectPlatform = jest.fn().mockReturnValue("desktop-web");

jest.mock("./notification-service", () => ({
    getPromptVariant: () => mockGetPromptVariant(),
    enableWebPush: (...args: any[]) => mockEnableWebPush(...args),
    enableIOSPush: jest.fn().mockResolvedValue(false),
    enableAndroidPush: jest.fn().mockResolvedValue(false),
    detectPlatform: () => mockDetectPlatform(),
}));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useNotificationPrompt } from "./useNotificationPrompt";

beforeEach(() => {
    jest.clearAllMocks();
    mockShouldShowPrompt.mockResolvedValue(true);
    mockGetPromptVariant.mockReturnValue("first-time");
    mockEnableWebPush.mockResolvedValue(true);
    mockDetectPlatform.mockReturnValue("desktop-web");
});

// =============================================================================
// showPrompt
// =============================================================================

describe("useNotificationPrompt — showPrompt", () => {
    it("shows modal when shouldShowPrompt returns true", async () => {
        const { result } = renderHook(() => useNotificationPrompt("user-1"));

        expect(result.current.modalProps.visible).toBe(false);

        await act(async () => {
            await result.current.showPrompt();
        });

        expect(result.current.modalProps.visible).toBe(true);
        expect(result.current.modalProps.variant).toBe("first-time");
        expect(mockSetPromptedThisSession).toHaveBeenCalled();
    });

    it("does not show modal when shouldShowPrompt returns false", async () => {
        mockShouldShowPrompt.mockResolvedValue(false);

        const { result } = renderHook(() => useNotificationPrompt("user-1"));

        await act(async () => {
            await result.current.showPrompt();
        });

        expect(result.current.modalProps.visible).toBe(false);
    });

    it('does not show modal when variant is "none"', async () => {
        mockGetPromptVariant.mockReturnValue("none");

        const { result } = renderHook(() => useNotificationPrompt("user-1"));

        await act(async () => {
            await result.current.showPrompt();
        });

        expect(result.current.modalProps.visible).toBe(false);
    });

    it("sets correct variant for iOS Safari", async () => {
        mockGetPromptVariant.mockReturnValue("ios-safari");

        const { result } = renderHook(() => useNotificationPrompt("user-1"));

        await act(async () => {
            await result.current.showPrompt();
        });

        expect(result.current.modalProps.variant).toBe("ios-safari");
    });

    it("sets correct variant for denied", async () => {
        mockGetPromptVariant.mockReturnValue("denied");

        const { result } = renderHook(() => useNotificationPrompt("user-1"));

        await act(async () => {
            await result.current.showPrompt();
        });

        expect(result.current.modalProps.variant).toBe("denied");
    });
});

// =============================================================================
// onEnable
// =============================================================================

describe("useNotificationPrompt — onEnable", () => {
    it("calls enableWebPush on desktop-web and closes modal", async () => {
        const { result } = renderHook(() => useNotificationPrompt("user-1"));

        // Open the modal first
        await act(async () => {
            await result.current.showPrompt();
        });
        expect(result.current.modalProps.visible).toBe(true);

        // Click enable
        await act(async () => {
            await result.current.modalProps.onEnable();
        });

        expect(mockEnableWebPush).toHaveBeenCalledWith("user-1");
        expect(result.current.modalProps.visible).toBe(false);
    });

    it("does nothing when userId is undefined", async () => {
        const { result } = renderHook(() => useNotificationPrompt(undefined));

        await act(async () => {
            await result.current.showPrompt();
        });
        await act(async () => {
            await result.current.modalProps.onEnable();
        });

        expect(mockEnableWebPush).not.toHaveBeenCalled();
    });
});

// =============================================================================
// onDismiss
// =============================================================================

describe("useNotificationPrompt — onDismiss", () => {
    it("closes modal and calls setDismissed", async () => {
        const { result } = renderHook(() => useNotificationPrompt("user-1"));

        await act(async () => {
            await result.current.showPrompt();
        });
        expect(result.current.modalProps.visible).toBe(true);

        await act(async () => {
            await result.current.modalProps.onDismiss();
        });

        expect(result.current.modalProps.visible).toBe(false);
        expect(mockSetDismissed).toHaveBeenCalled();
    });
});

// =============================================================================
// onPermanentDismiss
// =============================================================================

describe("useNotificationPrompt — onPermanentDismiss", () => {
    it("closes modal and calls setPermanentOptOut", async () => {
        const { result } = renderHook(() => useNotificationPrompt("user-1"));

        await act(async () => {
            await result.current.showPrompt();
        });
        expect(result.current.modalProps.visible).toBe(true);

        await act(async () => {
            await result.current.modalProps.onPermanentDismiss();
        });

        expect(result.current.modalProps.visible).toBe(false);
        expect(mockSetPermanentOptOut).toHaveBeenCalled();
    });
});
