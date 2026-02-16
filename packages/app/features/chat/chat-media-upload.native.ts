/**
 * Chat media upload - Native (iOS/Android)
 *
 * Uses expo-file-system/next File API + base64 encoding to read local files,
 * matching the pattern used by post-media and avatar uploads on native.
 */

import { supabase } from "../auth/auth-hook";
import { decode } from "base64-arraybuffer";
import { File } from "expo-file-system/next";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_IMAGE_DIM = 1200;
const IMAGE_COMPRESS = 0.8;

/**
 * Resize an image to fit within MAX_IMAGE_DIM × MAX_IMAGE_DIM.
 * This also normalises the URI to a file:// path that expo-file-system can read.
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
        console.log("🔧 [chat-media] Resized image:", result.uri);
        return result.uri;
    } catch (err) {
        console.warn("[chat-media] Image resize failed, using original:", err);
        return uri;
    }
}

/**
 * Read a file as an ArrayBuffer.
 * Tries expo-file-system/next File API first, falls back to
 * FileSystem.readAsStringAsync for content:// URIs on Android.
 */
async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
    try {
        const file = new File(uri);
        const base64 = await file.base64();
        if (base64 && base64.length > 0) {
            return decode(base64);
        }
        throw new Error("File.base64() returned empty");
    } catch (err) {
        console.log(
            "[chat-media] File API failed, using readAsStringAsync fallback:",
            err,
        );
        const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: "base64",
        });
        return decode(base64);
    }
}

/**
 * Upload a file to the chat-media bucket and create a media_assets record.
 * Native version: reads file via expo-file-system and uploads as ArrayBuffer.
 */
export async function uploadChatMedia(
    userId: string,
    fileUri: string,
    fileName: string,
    mimeType: string,
    mediaType: "image" | "video",
): Promise<{ mediaId: string; publicUrl: string }> {
    const ext = mediaType === "video" ? "mp4" : "jpg";
    const contentType = mediaType === "video" ? "video/mp4" : "image/jpeg";
    const storagePath = `${userId}/${Date.now()}_${
        Math.random().toString(36).slice(2, 8)
    }.${ext}`;

    console.log("📤 [chat-media] Native uploading:", storagePath);

    // Resize images before upload (also normalises URI for Android)
    const finalUri = mediaType === "image"
        ? await resizeImage(fileUri)
        : fileUri;

    // Read file as ArrayBuffer with fallback
    const arrayBuffer = await readFileAsArrayBuffer(finalUri);

    console.log("📦 [chat-media] Size:", arrayBuffer.byteLength);

    if (arrayBuffer.byteLength === 0) {
        throw new Error(
            "File is empty — could not read media from: " + finalUri,
        );
    }

    // Upload to storage
    const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(storagePath, arrayBuffer, { contentType, upsert: true });

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
            mime_type: mimeType,
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

    console.log("✅ [chat-media] Native upload successful:", urlData.publicUrl);

    return {
        mediaId: data.id,
        publicUrl: urlData.publicUrl,
    };
}
