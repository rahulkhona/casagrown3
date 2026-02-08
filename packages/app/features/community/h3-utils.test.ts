import {
    buildHexRegions,
    buildHexRegionsFromIndex,
    buildResolveResponseFromIndex,
    computeViewport,
    getHexBoundary,
    getHexCenter,
} from "./h3-utils";

// h3-js is available in Node test environment (not Hermes)
// so all functions should work with real H3 index values.

const TEST_H3_INDEX = "872830828ffffff"; // Example Res 7 H3 index
const TEST_NAME = "Test Community";
const TEST_CITY = "San Jose";

describe("h3-utils", () => {
    describe("getHexBoundary", () => {
        it("returns an array of coordinate pairs for a valid H3 index", () => {
            const boundary = getHexBoundary(TEST_H3_INDEX);
            expect(Array.isArray(boundary)).toBe(true);
            expect(boundary.length).toBeGreaterThan(0);
            // Each point should be [lat, lng]
            for (const point of boundary) {
                expect(point).toHaveLength(2);
                expect(typeof point[0]).toBe("number");
                expect(typeof point[1]).toBe("number");
            }
        });
    });

    describe("getHexCenter", () => {
        it("returns lat/lng for a valid H3 index", () => {
            const center = getHexCenter(TEST_H3_INDEX);
            expect(center).toHaveProperty("lat");
            expect(center).toHaveProperty("lng");
            expect(typeof center.lat).toBe("number");
            expect(typeof center.lng).toBe("number");
            // Should be non-zero for a valid index
            expect(Math.abs(center.lat) + Math.abs(center.lng)).toBeGreaterThan(
                0,
            );
        });
    });

    describe("buildHexRegions", () => {
        it("returns primary region marked as isPrimary", () => {
            const regions = buildHexRegions(
                { h3_index: TEST_H3_INDEX, name: TEST_NAME },
                [],
            );
            expect(regions).toHaveLength(1);
            expect(regions[0].isPrimary).toBe(true);
            expect(regions[0].name).toBe(TEST_NAME);
            expect(regions[0].h3Index).toBe(TEST_H3_INDEX);
        });

        it("includes neighbor regions marked as non-primary", () => {
            const neighborIndex = "872830829ffffff";
            const regions = buildHexRegions(
                { h3_index: TEST_H3_INDEX, name: TEST_NAME },
                [{ h3_index: neighborIndex, name: "Neighbor" }],
            );
            expect(regions).toHaveLength(2);
            expect(regions[1].isPrimary).toBe(false);
            expect(regions[1].name).toBe("Neighbor");
        });
    });

    describe("buildHexRegionsFromIndex", () => {
        it("builds regions from only an H3 index + name", () => {
            const regions = buildHexRegionsFromIndex(TEST_H3_INDEX, TEST_NAME);
            expect(regions.length).toBeGreaterThan(1); // primary + neighbors
            const primary = regions.find((r) => r.isPrimary);
            expect(primary).toBeDefined();
            expect(primary!.name).toBe(TEST_NAME);
        });
    });

    describe("buildResolveResponseFromIndex", () => {
        it("returns correct structure with primary, neighbors, resolved_location", () => {
            const response = buildResolveResponseFromIndex(
                TEST_H3_INDEX,
                TEST_NAME,
                TEST_CITY,
            );
            expect(response).toHaveProperty("primary");
            expect(response).toHaveProperty("neighbors");
            expect(response).toHaveProperty("resolved_location");
            expect(response.primary.h3_index).toBe(TEST_H3_INDEX);
            expect(response.primary.name).toBe(TEST_NAME);
            expect(response.primary.city).toBe(TEST_CITY);
            expect(response.neighbors.length).toBeGreaterThan(0);
        });

        it("uses H3-computed coordinates when no overrides provided", () => {
            const response = buildResolveResponseFromIndex(
                TEST_H3_INDEX,
                TEST_NAME,
                TEST_CITY,
            );
            const computed = getHexCenter(TEST_H3_INDEX);
            expect(response.resolved_location.lat).toBeCloseTo(computed.lat, 5);
            expect(response.resolved_location.lng).toBeCloseTo(computed.lng, 5);
        });

        it("uses override coordinates when overrideLat/overrideLng provided", () => {
            const overrideLat = 37.3382;
            const overrideLng = -121.8863;
            const response = buildResolveResponseFromIndex(
                TEST_H3_INDEX,
                TEST_NAME,
                TEST_CITY,
                overrideLat,
                overrideLng,
            );
            expect(response.resolved_location.lat).toBe(overrideLat);
            expect(response.resolved_location.lng).toBe(overrideLng);
            // The POINT in primary.location should also use override coords
            expect(response.primary.location).toContain(String(overrideLng));
            expect(response.primary.location).toContain(String(overrideLat));
        });

        it("generates neighbor names from abbreviated H3 indices", () => {
            const response = buildResolveResponseFromIndex(
                TEST_H3_INDEX,
                TEST_NAME,
                TEST_CITY,
            );
            for (const neighbor of response.neighbors) {
                expect(neighbor.name).toMatch(/^Zone /);
                expect(neighbor.h3_index).not.toBe(TEST_H3_INDEX);
            }
        });
    });

    describe("computeViewport", () => {
        it("returns correct viewport structure", () => {
            const regions = buildHexRegions(
                { h3_index: TEST_H3_INDEX, name: TEST_NAME },
                [],
            );
            const viewport = computeViewport(regions);
            expect(viewport).toHaveProperty("center");
            expect(viewport).toHaveProperty("zoom");
            expect(viewport).toHaveProperty("region");
            expect(viewport.zoom).toBeGreaterThan(0);
        });
    });
});
