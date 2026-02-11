/**
 * Load media from Supabase storage paths (Web version).
 * Uses fetch → blob → URL.createObjectURL for blob URLs.
 */

import { supabase } from "../auth/auth-hook";

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

            const response = await fetch(data.publicUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            loadedAssets.push({
                uri: blobUrl,
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
