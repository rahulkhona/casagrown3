import { useState } from "react";
import { supabase } from "../auth/auth-hook";

export type ResolvedCommunity = {
    h3_index: string;
    name: string;
    city: string;
    location: string; // WKT
};

export type NeighborCommunity = {
    h3_index: string;
    name: string;
    status: "active" | "unexplored";
};

export type ResolveResponse = {
    primary: ResolvedCommunity;
    neighbors: NeighborCommunity[];
    resolved_location: { lat: number; lng: number };
};

export const useResolveCommunity = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resolveAddress = async (
        address: string,
    ): Promise<ResolveResponse | null> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: fnError } = await supabase.functions.invoke(
                "resolve-community",
                {
                    body: { address },
                },
            );

            if (fnError) {
                console.error(
                    "Supabase Function Error Details:",
                    JSON.stringify(fnError, null, 2),
                );
                throw fnError;
            }
            return data as ResolveResponse;
        } catch (err: any) {
            console.error("Error resolving community (Full Catch):", err);
            setError(err.message || "Failed to find community");
            return null;
        } finally {
            setLoading(false);
        }
    };

    const resolveLocation = async (
        lat: number,
        lng: number,
    ): Promise<ResolveResponse | null> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: fnError } = await supabase.functions.invoke(
                "resolve-community",
                {
                    body: { lat, lng },
                },
            );

            if (fnError) throw fnError;
            return data as ResolveResponse;
        } catch (err: any) {
            console.error("Error resolving community:", err);
            setError(err.message || "Failed to find community");
            return null;
        } finally {
            setLoading(false);
        }
    };

    return {
        resolveAddress,
        resolveLocation,
        loading,
        error,
    };
};
