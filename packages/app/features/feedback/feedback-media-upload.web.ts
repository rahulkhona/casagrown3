/**
 * Feedback media upload — Web
 *
 * Uses the native File API to upload images to the feedback-media bucket.
 */

import { supabase } from "../auth/auth-hook";

export async function uploadFeedbackImage(
    userId: string,
    fileUri: string,
    fileName: string,
): Promise<{ mediaId: string; publicUrl: string }> {
    // On web, fileUri is a blob: URL from expo-image-picker
    const response = await fetch(fileUri);
    const blob = await response.blob();

    const storagePath = `${userId}/${Date.now()}_${
        Math.random().toString(36).slice(2, 8)
    }.jpg`;

    const { error: uploadError } = await supabase.storage
        .from("feedback-media")
        .upload(storagePath, blob, {
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
