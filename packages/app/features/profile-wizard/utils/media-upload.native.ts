import { supabase } from "../../auth/auth-hook";
import { decode } from "base64-arraybuffer";
import { File } from "expo-file-system/next";

export const uploadProfileAvatar = async (
    userId: string,
    uri: string,
): Promise<string | null> => {
    try {
        const filename = `${userId}/${Date.now()}.jpg`;

        console.log("📤 Starting native upload for:", filename);

        // Create File instance from URI and read as base64
        const file = new File(uri);
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
