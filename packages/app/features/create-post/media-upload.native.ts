import { supabase } from "../auth/auth-hook";
import { decode } from "base64-arraybuffer";
import { File } from "expo-file-system/next";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_IMAGE_DIM = 1200;
const IMAGE_COMPRESS = 0.8;

export interface UploadedMedia {
    storagePath: string;
    publicUrl: string;
    mediaType: "image" | "video";
}

/**
 * Resize an image to fit within MAX_IMAGE_DIM × MAX_IMAGE_DIM.
 * Returns the URI of the resized image.
 */
async function resizeImage(uri: string): Promise<string> {
    try {
        const result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: MAX_IMAGE_DIM } }],
            {
                compress: IMAGE_COMPRESS,
                format: ImageManipulator.SaveFormat.JPEG,
            },
        );
        console.log("🔧 [post-media] Resized image:", result.uri);
        return result.uri;
    } catch (err) {
        console.warn("[post-media] Image resize failed, using original:", err);
        return uri;
    }
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

        // Resize images before upload to save storage costs
        const finalUri = mediaType === "image" ? await resizeImage(uri) : uri;

        const file = new File(finalUri);
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
