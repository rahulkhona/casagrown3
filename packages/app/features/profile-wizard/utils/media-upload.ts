// Interface for media upload
// This file acts as the default/types, though usually bundler picks .web or .native
export const uploadProfileAvatar = async (
    userId: string,
    uri: string,
): Promise<string | null> => {
    throw new Error("Platform not supported");
};
