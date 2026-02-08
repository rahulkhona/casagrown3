/**
 * CommunityMap — shared types and props interface.
 * Platform-specific implementations are in CommunityMap.web.tsx and CommunityMap.native.tsx.
 */
import type { ResolveResponse } from "./use-resolve-community";

export interface CommunityMapProps {
    /** Community resolution data (primary + neighbors) */
    resolveData: ResolveResponse;
    /** Height of the map in pixels */
    height?: number;
    /** Whether to show community name labels on hexes */
    showLabels?: boolean;
}

export { default } from "./CommunityMap";
