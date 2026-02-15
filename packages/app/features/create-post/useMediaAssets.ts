/**
 * useMediaAssets — Shared hook for media picking, camera, gallery, and web file input
 *
 * Extracted from SellForm / BuyForm / GeneralForm to eliminate duplication.
 */

import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

// Minimal asset shape for web-picked files
export interface WebMediaAsset {
    uri: string;
    type: "image" | "video";
    width?: number;
    height?: number;
    fileName?: string;
    isExisting?: boolean;
}

export type MediaAsset = ImagePicker.ImagePickerAsset | WebMediaAsset;

export interface UseMediaAssetsReturn {
    mediaAssets: MediaAsset[];
    setMediaAssets: React.Dispatch<React.SetStateAction<MediaAsset[]>>;
    showMediaMenu: boolean;
    setShowMediaMenu: React.Dispatch<React.SetStateAction<boolean>>;
    cameraMode: "photo" | "video" | null;
    setCameraMode: React.Dispatch<
        React.SetStateAction<"photo" | "video" | null>
    >;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    handleWebFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleWebCameraCapture: (
        asset: { uri: string; type: "image" | "video"; fileName: string },
    ) => void;
    handlePickMedia: () => void;
    takePhoto: () => Promise<void>;
    pickFromGallery: () => Promise<void>;
    recordVideo: () => Promise<void>;
    removeMedia: (index: number) => void;
}

export function useMediaAssets(): UseMediaAssetsReturn {
    const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
    const [showMediaMenu, setShowMediaMenu] = useState(false);
    const [cameraMode, setCameraMode] = useState<"photo" | "video" | null>(
        null,
    );
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleWebFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            const file = files[0]!;
            const url = URL.createObjectURL(file);
            setMediaAssets([{
                uri: url,
                type: file.type.startsWith("video") ? "video" : "image",
                fileName: file.name,
            }]);
            e.target.value = "";
        },
        [],
    );

    const handleWebCameraCapture = useCallback(
        (asset: { uri: string; type: "image" | "video"; fileName: string }) => {
            setMediaAssets([asset]);
            setCameraMode(null);
        },
        [],
    );

    const handlePickMedia = useCallback(() => {
        if (Platform.OS === "web") {
            fileInputRef.current?.click();
        } else {
            setShowMediaMenu((prev) => !prev);
        }
    }, []);

    const takePhoto = useCallback(async () => {
        if (Platform.OS === "web") {
            setCameraMode("photo");
            return;
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
            console.warn("Camera permission denied");
            return;
        }
        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ["images"],
                allowsEditing: true,
                quality: 0.8,
                exif: false,
            });
            if (!result.canceled && result.assets.length > 0) {
                setMediaAssets([result.assets[0]!]);
            }
        } catch (e) {
            console.warn("Camera unavailable:", e);
        }
    }, []);

    const pickFromGallery = useCallback(async () => {
        if (Platform.OS === "web") {
            fileInputRef.current?.click();
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images", "videos"],
            allowsMultipleSelection: true,
            quality: 0.8,
            exif: false,
            videoMaxDuration: 30,
            videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
        });
        if (!result.canceled && result.assets.length > 0) {
            setMediaAssets([result.assets[0]!]);
        }
    }, []);

    const recordVideo = useCallback(async () => {
        if (Platform.OS === "web") {
            setCameraMode("video");
            return;
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
            console.warn("Camera permission denied");
            return;
        }
        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ["videos"],
                videoMaxDuration: 30,
                quality: 0.8,
                videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
            });
            if (!result.canceled && result.assets.length > 0) {
                setMediaAssets([result.assets[0]!]);
            }
        } catch (e) {
            console.warn("Camera unavailable:", e);
        }
    }, []);

    const removeMedia = useCallback((index: number) => {
        setMediaAssets((prev) => prev.filter((_, i) => i !== index));
    }, []);

    return {
        mediaAssets,
        setMediaAssets,
        showMediaMenu,
        setShowMediaMenu,
        cameraMode,
        setCameraMode,
        fileInputRef,
        handleWebFileChange,
        handleWebCameraCapture,
        handlePickMedia,
        takePhoto,
        pickFromGallery,
        recordVideo,
        removeMedia,
    };
}
