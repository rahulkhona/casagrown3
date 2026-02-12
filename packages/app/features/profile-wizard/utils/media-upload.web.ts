import { supabase } from "../../auth/auth-hook";

const MAX_AVATAR_DIM = 400;
const AVATAR_QUALITY = 0.8;

/**
 * Resize an image blob to fit within maxDim × maxDim,
 * re-encoding as JPEG at the given quality.
 */
async function resizeAvatarBlob(blob: Blob): Promise<Blob> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > MAX_AVATAR_DIM || height > MAX_AVATAR_DIM) {
                const ratio = Math.min(
                    MAX_AVATAR_DIM / width,
                    MAX_AVATAR_DIM / height,
                );
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
                AVATAR_QUALITY,
            );
        };
        img.onerror = () => resolve(blob); // fallback: upload original
        img.src = URL.createObjectURL(blob);
    });
}

// Web implementation using standard Fetch API
export const uploadProfileAvatar = async (
    userId: string,
    uri: string,
): Promise<string | null> => {
    try {
        const filename = `${userId}/${Date.now()}.jpg`;

        // On web, the URI from expo-image-picker is usually a blob: or data: URL
        const response = await fetch(uri);
        let blob = await response.blob();

        // Resize avatar before upload
        blob = await resizeAvatarBlob(blob);
        console.log("🔧 [avatar] Resized to:", blob.size, "bytes");

        const { error } = await supabase.storage.from("avatars").upload(
            filename,
            blob,
            {
                contentType: "image/jpeg",
                upsert: true,
            },
        );

        if (error) throw error;

        const { data } = supabase.storage.from("avatars").getPublicUrl(
            filename,
        );
        return data.publicUrl;
    } catch (e) {
        console.error("Web upload failed:", e);
        return null;
    }
};
