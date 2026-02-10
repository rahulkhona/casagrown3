import { supabase } from "../auth/auth-hook";
import { decode } from "base64-arraybuffer";
import { File } from "expo-file-system/next";

export interface UploadedMedia {
    storagePath: string;
    publicUrl: string;
    mediaType: "image" | "video";
}

/**
 * Upload a single media file to the post-media bucket (native).
 * Returns the storage path and public URL on success, null on failure.
 */
export const uploadPostMedia = async (
    userId: string,
    uri: string,
    mediaType: "image" | "video" = "image",
): Promise<UploadedMedia | null> => {
    try {
        const ext = mediaType === "video" ? "mp4" : "jpg";
        const contentType = mediaType === "video" ? "video/mp4" : "image/jpeg";
        const filename = `${userId}/${Date.now()}_${
            Math.random().toString(36).slice(2, 8)
        }.${ext}`;

        console.log("📤 [post-media] Uploading:", filename);

        const file = new File(uri);
        const base64 = await file.base64();
        const arrayBuffer = decode(base64);

        console.log("📦 [post-media] Size:", arrayBuffer.byteLength);

        const { error } = await supabase.storage.from("post-media").upload(
            filename,
            arrayBuffer,
            { contentType, upsert: true },
        );

        if (error) throw error;

        const { data } = supabase.storage.from("post-media").getPublicUrl(
            filename,
        );
        console.log("✅ [post-media] Uploaded:", data.publicUrl);

        return {
            storagePath: filename,
            publicUrl: data.publicUrl,
            mediaType,
        };
    } catch (e) {
        console.error("[post-media] Native upload failed:", e);
        return null;
    }
};

/**
 * Upload multiple media files and return the successful uploads.
 */
export const uploadPostMediaBatch = async (
    userId: string,
    assets: Array<{ uri: string; type?: string }>,
): Promise<UploadedMedia[]> => {
    const results: UploadedMedia[] = [];

    for (const asset of assets) {
        const mediaType: "image" | "video" = asset.type?.startsWith("video")
            ? "video"
            : "image";
        const result = await uploadPostMedia(userId, asset.uri, mediaType);
        if (result) results.push(result);
    }

    return results;
};
