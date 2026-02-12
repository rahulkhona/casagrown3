import { supabase } from "../../auth/auth-hook";
import { decode } from "base64-arraybuffer";
import { File } from "expo-file-system/next";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_AVATAR_DIM = 400;
const AVATAR_COMPRESS = 0.8;

/**
 * Resize an avatar image to fit within MAX_AVATAR_DIM × MAX_AVATAR_DIM.
 * Returns the URI of the resized image.
 */
async function resizeAvatar(uri: string): Promise<string> {
    try {
        const result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: MAX_AVATAR_DIM } }],
            {
                compress: AVATAR_COMPRESS,
                format: ImageManipulator.SaveFormat.JPEG,
            },
        );
        console.log("🔧 [avatar] Resized image:", result.uri);
        return result.uri;
    } catch (err) {
        console.warn("[avatar] Image resize failed, using original:", err);
        return uri;
    }
}

export const uploadProfileAvatar = async (
    userId: string,
    uri: string,
): Promise<string | null> => {
    try {
        const filename = `${userId}/${Date.now()}.jpg`;

        console.log("📤 Starting native upload for:", filename);

        // Resize avatar before upload to save storage costs
        const resizedUri = await resizeAvatar(uri);

        // Create File instance from URI and read as base64
        const file = new File(resizedUri);
        const base64 = await file.base64();

        console.log("📄 Read file, base64 length:", base64.length);

        // Convert base64 to ArrayBuffer
        const arrayBuffer = decode(base64);

        console.log("📦 Decoded to ArrayBuffer, size:", arrayBuffer.byteLength);

        const { error } = await supabase.storage.from("avatars").upload(
            filename,
            arrayBuffer,
            {
                contentType: "image/jpeg",
                upsert: true,
            },
        );

        if (error) throw error;

        const { data } = supabase.storage.from("avatars").getPublicUrl(
            filename,
        );
        console.log("✅ Native upload successful:", data.publicUrl);
        return data.publicUrl;
    } catch (e) {
        console.error("Native upload failed:", e);
        return null;
    }
};
