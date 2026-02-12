import { supabase } from "../auth/auth-hook";

/**
 * Resize an image blob to fit within maxDim × maxDim,
 * re-encoding as JPEG at the given quality. If the image is
 * already smaller, it is returned as-is (re-encoded to JPEG).
 */
async function resizeImageBlob(
    blob: Blob,
    maxDim: number,
    quality: number,
): Promise<Blob> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
                const ratio = Math.min(maxDim / width, maxDim / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
                (result) => resolve(result || blob),
                "image/jpeg",
                quality,
            );
        };
        img.onerror = () => resolve(blob); // fallback: upload original
        img.src = URL.createObjectURL(blob);
    });
}

export interface UploadedMedia {
    storagePath: string;
    publicUrl: string;
    mediaType: "image" | "video";
}

/**
 * Upload a single media file to the post-media bucket (web).
 */
export const uploadPostMedia = async (
    userId: string,
    uri: string,
    mediaType: "image" | "video" = "image",
): Promise<UploadedMedia | null> => {
    try {
        console.log("📤 [post-media] Web uploading for:", mediaType);

        const response = await fetch(uri);
        let blob = await response.blob();

        // Use actual blob mimetype to determine extension and content type
        const blobMime = blob.type ||
            (mediaType === "video" ? "video/mp4" : "image/jpeg");
        let ext: string;
        let contentType: string;
        if (mediaType === "video") {
            // Browsers often capture video as webm; preserve actual format
            ext = blobMime.includes("webm") ? "webm" : "mp4";
            contentType = blobMime.startsWith("video/")
                ? blobMime
                : "video/mp4";
        } else {
            ext = "jpg";
            contentType = "image/jpeg";
        }
        const filename = `${userId}/${Date.now()}_${
            Math.random().toString(36).slice(2, 8)
        }.${ext}`;

        // Resize images on the client to save storage costs
        if (mediaType === "image") {
            blob = await resizeImageBlob(blob, 1200, 0.8);
        }

        console.log("📦 [post-media] Size:", blob.size);

        const { error } = await supabase.storage.from("post-media").upload(
            filename,
            blob,
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
        console.error("[post-media] Web upload failed:", e);
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
