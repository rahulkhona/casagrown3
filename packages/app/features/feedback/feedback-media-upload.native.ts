/**
 * Feedback media upload — Native (iOS/Android)
 *
 * Uses expo-file-system + expo-image-manipulator to read and resize images,
 * then uploads to the feedback-media Supabase bucket.
 */

import { supabase } from "../auth/auth-hook";
import { decode } from "base64-arraybuffer";
import { File } from "expo-file-system/next";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_IMAGE_DIM = 1200;
const IMAGE_COMPRESS = 0.8;

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
        return result.uri;
    } catch (err) {
        console.warn(
            "[feedback-media] Image resize failed, using original:",
            err,
        );
        return uri;
    }
}

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
            "[feedback-media] File API failed, using readAsStringAsync fallback:",
            err,
        );
        const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: "base64",
        });
        return decode(base64);
    }
}

export async function uploadFeedbackImage(
    userId: string,
    fileUri: string,
    fileName: string,
): Promise<{ mediaId: string; publicUrl: string }> {
    const storagePath = `${userId}/${Date.now()}_${
        Math.random().toString(36).slice(2, 8)
    }.jpg`;

    const finalUri = await resizeImage(fileUri);
    const arrayBuffer = await readFileAsArrayBuffer(finalUri);

    if (arrayBuffer.byteLength === 0) {
        throw new Error(
            "File is empty — could not read image from: " + finalUri,
        );
    }

    const { error: uploadError } = await supabase.storage
        .from("feedback-media")
        .upload(storagePath, arrayBuffer, {
            contentType: "image/jpeg",
            upsert: true,
        });

    if (uploadError) {
        console.error("Error uploading feedback image:", uploadError);
        throw uploadError;
    }

    const { data: asset, error } = await supabase
        .from("media_assets")
        .insert({
            owner_id: userId,
            storage_path: storagePath,
            media_type: "image",
            mime_type: "image/jpeg",
            metadata: { original_name: fileName },
        })
        .select("id")
        .single();

    if (error) {
        console.error("Error creating media asset:", error);
        throw error;
    }

    const { data: urlData } = supabase.storage
        .from("feedback-media")
        .getPublicUrl(storagePath);

    return {
        mediaId: asset.id,
        publicUrl: urlData.publicUrl,
    };
}
