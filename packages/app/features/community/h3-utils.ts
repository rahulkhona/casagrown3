/**
 * H3 geospatial utilities for computing hex boundaries and map regions.
 * Used client-side to convert H3 indices → polygon coordinates for map rendering.
 *
 * On React Native (Hermes), h3-js WASM fails because Hermes' built-in TextDecoder
 * doesn't support utf-16le. We catch that and provide stubs — native map receives
 * pre-computed data from the server's resolve-community edge function instead.
 */
let cellToBoundary: (h3Index: string) => number[][];
let cellToLatLng: (h3Index: string) => [number, number];
let gridDisk: (h3Index: string, k: number) => string[];
let isValidCell: (h3Index: string) => boolean;

try {
    const h3 = require("h3-js");
    cellToBoundary = h3.cellToBoundary;
    cellToLatLng = h3.cellToLatLng;
    gridDisk = h3.gridDisk;
    isValidCell = h3.isValidCell;
} catch {
    // h3-js WASM fails on Hermes (utf-16le unsupported) — provide stubs
    console.warn(
        "[h3-utils] h3-js unavailable (expected on React Native), using stubs",
    );
    cellToBoundary = () => [];
    cellToLatLng = () => [0, 0];
    gridDisk = (index) => [index];
    isValidCell = () => true; // assume valid on native (server provides data)
}

/** Polygon coordinates for a single H3 hex, in [lat, lng] format */
export type HexBoundary = [number, number][];

/** Center point of a hex */
export type HexCenter = { lat: number; lng: number };

/** Processed hex data ready for map rendering */
export interface HexRegion {
    h3Index: string;
    name: string;
    boundary: HexBoundary;
    center: HexCenter;
    isPrimary: boolean;
}

/** Map viewport derived from hex bounds */
export interface MapViewport {
    center: HexCenter;
    /** Suggested zoom level for Leaflet */
    zoom: number;
    /** Region for react-native-maps */
    region: {
        latitude: number;
        longitude: number;
        latitudeDelta: number;
        longitudeDelta: number;
    };
}

/**
 * Convert an H3 index to boundary polygon coordinates.
 * Returns [[lat, lng], ...] — Leaflet format.
 */
export function getHexBoundary(h3Index: string): HexBoundary {
    return cellToBoundary(h3Index) as HexBoundary;
}

/**
 * Get the center point of an H3 cell.
 */
export function getHexCenter(h3Index: string): HexCenter {
    const [lat, lng] = cellToLatLng(h3Index);
    return { lat, lng };
}

/**
 * Process a primary H3 index and its neighbors into HexRegion objects
 * ready for map rendering.
 */
export function buildHexRegions(
    primary: { h3_index: string; name: string },
    neighbors: { h3_index: string; name: string }[],
): HexRegion[] {
    const regions: HexRegion[] = [];

    // Primary hex
    regions.push({
        h3Index: primary.h3_index,
        name: primary.name,
        boundary: getHexBoundary(primary.h3_index),
        center: getHexCenter(primary.h3_index),
        isPrimary: true,
    });

    // Neighbor hexes
    for (const neighbor of neighbors) {
        regions.push({
            h3Index: neighbor.h3_index,
            name: neighbor.name,
            boundary: getHexBoundary(neighbor.h3_index),
            center: getHexCenter(neighbor.h3_index),
            isPrimary: false,
        });
    }

    return regions;
}

/**
 * Build HexRegions from pre-computed boundary data (from server).
 * Used on native where h3-js can't run — boundaries come from the edge function.
 */
export function buildHexRegionsFromBoundaries(
    primary: { h3_index: string; name: string },
    neighbors: { h3_index: string; name: string }[],
    hexBoundaries: Record<string, number[][]>,
): HexRegion[] {
    const regions: HexRegion[] = [];

    const primaryBoundary = hexBoundaries[primary.h3_index];
    if (primaryBoundary && primaryBoundary.length > 0) {
        const center = computeCentroid(primaryBoundary);
        regions.push({
            h3Index: primary.h3_index,
            name: primary.name,
            boundary: primaryBoundary as HexBoundary,
            center,
            isPrimary: true,
        });
    }

    for (const neighbor of neighbors) {
        const boundary = hexBoundaries[neighbor.h3_index];
        if (boundary && boundary.length > 0) {
            const center = computeCentroid(boundary);
            regions.push({
                h3Index: neighbor.h3_index,
                name: neighbor.name,
                boundary: boundary as HexBoundary,
                center,
                isPrimary: false,
            });
        }
    }

    return regions;
}

/** Compute centroid of a polygon from its boundary coordinates */
function computeCentroid(boundary: number[][]): HexCenter {
    let latSum = 0;
    let lngSum = 0;
    for (const [lat, lng] of boundary) {
        latSum += lat;
        lngSum += lng;
    }
    return { lat: latSum / boundary.length, lng: lngSum / boundary.length };
}

/**
 * Compute a viewport that fits all hex regions.
 */
export function computeViewport(
    regions: HexRegion[],
    userLocation?: { lat: number; lng: number },
): MapViewport {
    // Collect all boundary points
    const allLats: number[] = [];
    const allLngs: number[] = [];

    for (const region of regions) {
        for (const [lat, lng] of region.boundary) {
            allLats.push(lat);
            allLngs.push(lng);
        }
    }

    if (allLats.length === 0) {
        // Fallback to user location or default
        const center = userLocation || { lat: 37.3382, lng: -121.8863 }; // San Jose
        return {
            center,
            zoom: 13,
            region: {
                latitude: center.lat,
                longitude: center.lng,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            },
        };
    }

    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const minLng = Math.min(...allLngs);
    const maxLng = Math.max(...allLngs);

    const center = {
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2,
    };

    const latDelta = (maxLat - minLat) * 1.3; // 30% padding
    const lngDelta = (maxLng - minLng) * 1.3;

    return {
        center,
        zoom: 13, // Good for resolution-7 hexagons (~5km²)
        region: {
            latitude: center.lat,
            longitude: center.lng,
            latitudeDelta: Math.max(latDelta, 0.02),
            longitudeDelta: Math.max(lngDelta, 0.02),
        },
    };
}

/**
 * Build hex regions from just an H3 index (no server call needed).
 * Uses gridDisk to compute the ring of neighbor cells client-side.
 * Neighbor names default to "Zone" + abbreviated index since we don't
 * have server-side community names for them.
 */
export function buildHexRegionsFromIndex(
    h3Index: string,
    primaryName: string,
): HexRegion[] {
    if (!isValidCell(h3Index)) {
        console.warn(
            `[h3-utils] Invalid H3 index in buildHexRegionsFromIndex: ${h3Index}`,
        );
        return [];
    }
    const allCells = gridDisk(h3Index, 1);
    const regions: HexRegion[] = [];

    for (const cell of allCells) {
        const isPrimary = cell === h3Index;
        regions.push({
            h3Index: cell,
            name: isPrimary ? primaryName : `Zone ${cell.slice(-4)}`,
            boundary: getHexBoundary(cell),
            center: getHexCenter(cell),
            isPrimary,
        });
    }

    return regions;
}

/**
 * Build a minimal ResolveResponse from an H3 index for CommunityMap.
 * Used in the profile manager where we have the H3 index but not the
 * full resolve response from the edge function.
 *
 * On native (Hermes), h3-js is stubbed so cellToLatLng returns [0,0].
 * Pass overrideLat/Lng from the DB to ensure the map gets real coordinates.
 */
export function buildResolveResponseFromIndex(
    h3Index: string,
    communityName: string,
    communityCity: string,
    overrideLat?: number,
    overrideLng?: number,
) {
    if (!isValidCell(h3Index)) {
        console.warn(
            `[h3-utils] Invalid H3 index in buildResolveResponseFromIndex: ${h3Index}`,
        );
        return {
            primary: {
                h3_index: h3Index,
                name: communityName,
                city: communityCity,
                location: `POINT(${overrideLng ?? 0} ${overrideLat ?? 0})`,
            },
            neighbors: [],
            resolved_location: { lat: overrideLat ?? 0, lng: overrideLng ?? 0 },
        };
    }
    const h3Center = getHexCenter(h3Index);
    // Use override coordinates if provided (needed on native where h3-js stubs return 0,0)
    const center = (overrideLat != null && overrideLng != null)
        ? { lat: overrideLat, lng: overrideLng }
        : h3Center;
    const neighborCells = gridDisk(h3Index, 1).filter((c) => c !== h3Index);

    return {
        primary: {
            h3_index: h3Index,
            name: communityName,
            city: communityCity,
            location: `POINT(${center.lng} ${center.lat})`,
        },
        neighbors: neighborCells.map((cell) => ({
            h3_index: cell,
            name: `Zone ${cell.slice(-4)}`,
            status: "unexplored" as const,
        })),
        resolved_location: center,
    };
}
