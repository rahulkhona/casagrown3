// Default / types — bundler picks .web.ts or .native.ts at build time

/**
 * Upload a file to the chat-media bucket and create a media_assets record.
 * This is the fallback; platform-specific versions provide the actual implementation.
 */
export const uploadChatMedia = async (
    _userId: string,
    _fileUri: string,
    _fileName: string,
    _mimeType: string,
    _mediaType: "image" | "video",
): Promise<{ mediaId: string; publicUrl: string }> => {
    throw new Error("Platform not supported");
};
