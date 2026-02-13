/**
 * Chat media upload - Web
 *
 * Uses fetch + blob for web environment where File API from expo-file-system
 * is not available. Includes client-side image resizing for bandwidth optimization.
 */

import { supabase } from "../auth/auth-hook";

const MAX_IMAGE_DIM = 1200;
const IMAGE_QUALITY = 0.8;

/**
 * Resize an image blob to fit within maxDim × maxDim,
 * re-encoding as JPEG at the given quality.
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
        img.onerror = () => resolve(blob);
        img.src = URL.createObjectURL(blob);
    });
}

/**
 * Upload a file to the chat-media bucket and create a media_assets record.
 * Web version: uses fetch to read the file URI as a blob, with image resizing.
 */
export async function uploadChatMedia(
    userId: string,
    fileUri: string,
    fileName: string,
    mimeType: string,
    mediaType: "image" | "video",
): Promise<{ mediaId: string; publicUrl: string }> {
    console.log("📤 [chat-media] Web uploading:", fileName);

    // Fetch file data as blob
    const response = await fetch(fileUri);
    let blob = await response.blob();

    // Determine content type and extension
    const blobMime = blob.type ||
        (mediaType === "video" ? "video/mp4" : "image/jpeg");
    let ext: string;
    let contentType: string;
    if (mediaType === "video") {
        ext = blobMime.includes("webm") ? "webm" : "mp4";
        contentType = blobMime.startsWith("video/") ? blobMime : "video/mp4";
    } else {
        ext = "jpg";
        contentType = "image/jpeg";
    }

    const storagePath = `${userId}/${Date.now()}_${
        Math.random().toString(36).slice(2, 8)
    }.${ext}`;

    // Resize images before upload to save bandwidth
    if (mediaType === "image") {
        blob = await resizeImageBlob(blob, MAX_IMAGE_DIM, IMAGE_QUALITY);
    }

    console.log("📦 [chat-media] Size:", blob.size);

    // Upload to storage
    const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(storagePath, blob, { contentType, upsert: true });

    if (uploadError) {
        console.error("Error uploading chat media:", uploadError);
        throw uploadError;
    }

    // Create media_assets record
    const { data, error } = await supabase
        .from("media_assets")
        .insert({
            owner_id: userId,
            storage_path: storagePath,
            media_type: mediaType,
            mime_type: contentType,
        })
        .select("id")
        .single();

    if (error) {
        console.error("Error creating media asset:", error);
        throw error;
    }

    const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(storagePath);

    console.log("✅ [chat-media] Web upload successful:", urlData.publicUrl);

    return {
        mediaId: data.id,
        publicUrl: urlData.publicUrl,
    };
}
