// Default / types — bundler picks .web.ts or .native.ts
export interface UploadedMedia {
    storagePath: string;
    publicUrl: string;
    mediaType: "image" | "video";
}

export const uploadPostMedia = async (
    _userId: string,
    _uri: string,
    _mediaType?: "image" | "video",
): Promise<UploadedMedia | null> => {
    throw new Error("Platform not supported");
};

export const uploadPostMediaBatch = async (
    _userId: string,
    _assets: Array<{ uri: string; type?: string }>,
): Promise<UploadedMedia[]> => {
    throw new Error("Platform not supported");
};
