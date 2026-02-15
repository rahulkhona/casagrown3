/**
 * useMediaAssets Hook Tests
 *
 * Tests the shared media management hook used across all create-post forms.
 * Covers: initial state, add/remove media, web file change, web camera capture,
 * native camera/gallery pickers, and platform branching.
 */

import { act, renderHook } from "@testing-library/react-native";

// Mock Platform
const mockPlatformOS = jest.fn().mockReturnValue("ios");
jest.mock("react-native", () => ({
    Platform: {
        get OS() {
            return mockPlatformOS();
        },
    },
}));

// Mock expo-image-picker
const mockLaunchCameraAsync = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();
const mockRequestCameraPermissionsAsync = jest.fn();

jest.mock("expo-image-picker", () => ({
    launchCameraAsync: (...args: any[]) => mockLaunchCameraAsync(...args),
    launchImageLibraryAsync: (...args: any[]) =>
        mockLaunchImageLibraryAsync(...args),
    requestCameraPermissionsAsync: (...args: any[]) =>
        mockRequestCameraPermissionsAsync(...args),
    VideoExportPreset: { MediumQuality: 1 },
}));

import { useMediaAssets } from "./useMediaAssets";

describe("useMediaAssets", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPlatformOS.mockReturnValue("ios");
        mockRequestCameraPermissionsAsync.mockResolvedValue({
            status: "granted",
        });
    });

    // ── Initial State ─────────────────────────────────────────

    it("starts with empty media assets", () => {
        const { result } = renderHook(() => useMediaAssets());
        expect(result.current.mediaAssets).toEqual([]);
    });

    it("starts with camera mode null", () => {
        const { result } = renderHook(() => useMediaAssets());
        expect(result.current.cameraMode).toBeNull();
    });

    it("starts with showMediaMenu false", () => {
        const { result } = renderHook(() => useMediaAssets());
        expect(result.current.showMediaMenu).toBe(false);
    });

    // ── removeMedia ───────────────────────────────────────────

    it("removes media by index", () => {
        const { result } = renderHook(() => useMediaAssets());

        // Add 3 items
        act(() => {
            result.current.setMediaAssets([
                { uri: "a.jpg", type: "image" as const },
                { uri: "b.mp4", type: "video" as const },
                { uri: "c.jpg", type: "image" as const },
            ]);
        });
        expect(result.current.mediaAssets).toHaveLength(3);

        // Remove middle item
        act(() => {
            result.current.removeMedia(1);
        });
        expect(result.current.mediaAssets).toHaveLength(2);
        expect(result.current.mediaAssets[0]!.uri).toBe("a.jpg");
        expect(result.current.mediaAssets[1]!.uri).toBe("c.jpg");
    });

    it("removes media from start of array", () => {
        const { result } = renderHook(() => useMediaAssets());
        act(() => {
            result.current.setMediaAssets([
                { uri: "a.jpg", type: "image" as const },
                { uri: "b.jpg", type: "image" as const },
            ]);
        });
        act(() => {
            result.current.removeMedia(0);
        });
        expect(result.current.mediaAssets).toHaveLength(1);
        expect(result.current.mediaAssets[0]!.uri).toBe("b.jpg");
    });

    // ── handleWebCameraCapture ────────────────────────────────

    it("handleWebCameraCapture sets media and clears camera mode", () => {
        const { result } = renderHook(() => useMediaAssets());

        // Set camera mode first
        act(() => {
            result.current.setCameraMode("photo");
        });
        expect(result.current.cameraMode).toBe("photo");

        // Capture
        act(() => {
            result.current.handleWebCameraCapture({
                uri: "blob:photo.jpg",
                type: "image",
                fileName: "photo.jpg",
            });
        });

        expect(result.current.mediaAssets).toHaveLength(1);
        expect(result.current.mediaAssets[0]!.uri).toBe("blob:photo.jpg");
        expect(result.current.cameraMode).toBeNull();
    });

    it("handleWebCameraCapture works for video", () => {
        const { result } = renderHook(() => useMediaAssets());
        act(() => {
            result.current.setCameraMode("video");
        });

        act(() => {
            result.current.handleWebCameraCapture({
                uri: "blob:video.webm",
                type: "video",
                fileName: "video.webm",
            });
        });

        expect(result.current.mediaAssets).toHaveLength(1);
        expect(result.current.mediaAssets[0]!.type).toBe("video");
        expect(result.current.cameraMode).toBeNull();
    });

    // ── handlePickMedia ───────────────────────────────────────

    it("handlePickMedia toggles showMediaMenu on native", () => {
        mockPlatformOS.mockReturnValue("ios");
        const { result } = renderHook(() => useMediaAssets());

        act(() => {
            result.current.handlePickMedia();
        });
        expect(result.current.showMediaMenu).toBe(true);

        act(() => {
            result.current.handlePickMedia();
        });
        expect(result.current.showMediaMenu).toBe(false);
    });

    // ── takePhoto (native) ────────────────────────────────────

    it("takePhoto launches camera on native when permission granted", async () => {
        mockPlatformOS.mockReturnValue("ios");
        mockLaunchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                uri: "native-photo.jpg",
                type: "image",
                width: 800,
                height: 600,
            }],
        });

        const { result } = renderHook(() => useMediaAssets());

        await act(async () => {
            await result.current.takePhoto();
        });

        expect(mockRequestCameraPermissionsAsync).toHaveBeenCalled();
        expect(mockLaunchCameraAsync).toHaveBeenCalledWith(
            expect.objectContaining({ mediaTypes: ["images"] }),
        );
        expect(result.current.mediaAssets).toHaveLength(1);
        expect(result.current.mediaAssets[0]!.uri).toBe("native-photo.jpg");
    });

    it("takePhoto does nothing when camera permission denied", async () => {
        mockPlatformOS.mockReturnValue("ios");
        mockRequestCameraPermissionsAsync.mockResolvedValue({
            status: "denied",
        });

        const { result } = renderHook(() => useMediaAssets());

        await act(async () => {
            await result.current.takePhoto();
        });

        expect(mockLaunchCameraAsync).not.toHaveBeenCalled();
        expect(result.current.mediaAssets).toHaveLength(0);
    });

    it("takePhoto does nothing when user cancels camera", async () => {
        mockPlatformOS.mockReturnValue("ios");
        mockLaunchCameraAsync.mockResolvedValue({ canceled: true, assets: [] });

        const { result } = renderHook(() => useMediaAssets());

        await act(async () => {
            await result.current.takePhoto();
        });

        expect(result.current.mediaAssets).toHaveLength(0);
    });

    it("takePhoto sets camera mode to photo on web", async () => {
        mockPlatformOS.mockReturnValue("web");
        const { result } = renderHook(() => useMediaAssets());

        await act(async () => {
            await result.current.takePhoto();
        });

        expect(result.current.cameraMode).toBe("photo");
        expect(mockLaunchCameraAsync).not.toHaveBeenCalled();
    });

    // ── recordVideo (native) ──────────────────────────────────

    it("recordVideo launches camera for video on native", async () => {
        mockPlatformOS.mockReturnValue("ios");
        mockLaunchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                uri: "native-video.mp4",
                type: "video",
                width: 1280,
                height: 720,
            }],
        });

        const { result } = renderHook(() => useMediaAssets());

        await act(async () => {
            await result.current.recordVideo();
        });

        expect(mockLaunchCameraAsync).toHaveBeenCalledWith(
            expect.objectContaining({ mediaTypes: ["videos"] }),
        );
        expect(result.current.mediaAssets).toHaveLength(1);
        expect(result.current.mediaAssets[0]!.uri).toBe("native-video.mp4");
    });

    it("recordVideo sets camera mode to video on web", async () => {
        mockPlatformOS.mockReturnValue("web");
        const { result } = renderHook(() => useMediaAssets());

        await act(async () => {
            await result.current.recordVideo();
        });

        expect(result.current.cameraMode).toBe("video");
        expect(mockLaunchCameraAsync).not.toHaveBeenCalled();
    });

    // ── pickFromGallery (native) ──────────────────────────────

    it("pickFromGallery launches image library on native", async () => {
        mockPlatformOS.mockReturnValue("ios");
        mockLaunchImageLibraryAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                uri: "gallery-photo.jpg",
                type: "image",
                width: 1024,
                height: 768,
            }],
        });

        const { result } = renderHook(() => useMediaAssets());

        await act(async () => {
            await result.current.pickFromGallery();
        });

        expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                mediaTypes: ["images", "videos"],
                allowsMultipleSelection: true,
            }),
        );
        expect(result.current.mediaAssets).toHaveLength(1);
        expect(result.current.mediaAssets[0]!.uri).toBe("gallery-photo.jpg");
    });

    it("pickFromGallery does nothing when user cancels", async () => {
        mockPlatformOS.mockReturnValue("ios");
        mockLaunchImageLibraryAsync.mockResolvedValue({
            canceled: true,
            assets: [],
        });

        const { result } = renderHook(() => useMediaAssets());

        await act(async () => {
            await result.current.pickFromGallery();
        });

        expect(result.current.mediaAssets).toHaveLength(0);
    });
});
