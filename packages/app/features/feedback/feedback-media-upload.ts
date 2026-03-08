// Default / types — bundler picks .web.ts or .native.ts at build time

/**
 * Upload an image to the feedback-media bucket and create a media_assets record.
 * This is the fallback; platform-specific versions provide the actual implementation.
 */
export const uploadFeedbackImage = async (
    _userId: string,
    _fileUri: string,
    _fileName: string,
): Promise<{ mediaId: string; publicUrl: string }> => {
    throw new Error("Platform not supported");
};
