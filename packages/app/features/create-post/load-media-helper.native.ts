/**
 * Load media from Supabase storage paths (Native version).
 * Downloads to local cache files via expo-file-system/next File API.
 */

import { supabase } from "../auth/auth-hook";
import { File, Paths } from "expo-file-system/next";

interface StorageMedia {
    storage_path: string;
    media_type: string;
}

interface LoadedAsset {
    uri: string;
    type: "image" | "video";
    width: number;
    height: number;
    isExisting?: boolean;
}

export async function loadMediaFromStorage(
    media: StorageMedia[],
    options?: { isExisting?: boolean },
): Promise<LoadedAsset[]> {
    const loadedAssets: LoadedAsset[] = [];

    for (const m of media) {
        try {
            const { data } = supabase.storage.from("post-media").getPublicUrl(
                m.storage_path,
            );
            const mediaType: "image" | "video" = m.media_type === "video"
                ? "video"
                : "image";

            const ext = mediaType === "video" ? "mp4" : "jpg";
            const filename = `clone_${Date.now()}_${
                Math.random().toString(36).slice(2, 6)
            }.${ext}`;
            const destination = new File(Paths.cache, filename);

            // Download using the static downloadFileAsync method
            const downloadedFile = await File.downloadFileAsync(
                data.publicUrl,
                destination,
            );

            loadedAssets.push({
                uri: downloadedFile.uri,
                type: mediaType,
                width: 80,
                height: 80,
                ...(options?.isExisting ? { isExisting: true } : {}),
            });
        } catch (e) {
            console.error("Failed to load media:", m.storage_path, e);
        }
    }

    return loadedAssets;
}
