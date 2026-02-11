// Default / types — bundler picks .web.ts or .native.ts

interface StorageMedia {
    storage_path: string;
    media_type: string;
}

interface LoadedAsset {
    uri: string;
    type: "image" | "video";
    width: number;
    height: number;
    isExisting?: boolean;
}

export async function loadMediaFromStorage(
    _media: StorageMedia[],
    _options?: { isExisting?: boolean },
): Promise<LoadedAsset[]> {
    console.warn(
        "loadMediaFromStorage: no platform-specific implementation available; media will not load.",
    );
    return [];
}
