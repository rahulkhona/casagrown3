import { supabase } from "../../auth/auth-hook";

// Web implementation using standard Fetch API
export const uploadProfileAvatar = async (
    userId: string,
    uri: string,
): Promise<string | null> => {
    try {
        const filename = `${userId}/${Date.now()}.jpg`;

        // On web, the URI from expo-image-picker is usually a blob: or data: URL
        const response = await fetch(uri);
        const blob = await response.blob();

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
