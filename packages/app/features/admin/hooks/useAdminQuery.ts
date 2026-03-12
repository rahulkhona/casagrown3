import { useCallback, useEffect, useState } from "react";
import { supabase } from "@casagrown/app/utils/supabase";

export interface UseAdminQueryOptions {
    table: string;
    pageSize?: number;
    defaultSortParams?: { column: string; ascending: boolean };
    filterColumn?: string;
    filterValue?: string;
}

export function useAdminQuery<T = any>({
    table,
    pageSize = 20,
    defaultSortParams,
    filterColumn,
    filterValue,
}: UseAdminQueryOptions) {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sortColumn = defaultSortParams?.column;
    const sortAscending = defaultSortParams?.ascending;

    const fetchData = useCallback(async (currentPage: number) => {
        setLoading(true);
        setError(null);
        try {
            let query = supabase
                .from(table)
                .select("*", { count: "exact" });

            if (filterColumn && filterValue) {
                // Simple ilike text filter for search
                query = query.ilike(filterColumn, `%${filterValue}%`);
            }

            if (sortColumn) {
                query = query.order(sortColumn, {
                    ascending: sortAscending,
                });
            } else {
                // Fallback to updated_at or created_at if possible (PostgREST will ignore if missing, but it's safer to provide it via defaultSort)
                query = query.order("created_at", { ascending: false });
            }

            const from = (currentPage - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data: result, error: fetchError, count } = await query
                .range(from, to);

            if (fetchError) throw fetchError;

            setData(result as unknown as T[]);
            setHasMore(count ? (from + result.length) < count : false);
        } catch (e: any) {
            console.error(`Error fetching admin data for ${table}:`, e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [table, pageSize, sortColumn, sortAscending, filterColumn, filterValue]);

    useEffect(() => {
        fetchData(page);
    }, [fetchData, page]);

    const next = () => {
        if (hasMore) setPage((p) => p + 1);
    };

    const prev = () => {
        if (page > 1) setPage((p) => p - 1);
    };

    const refresh = () => {
        fetchData(page);
    };

    return {
        data,
        loading,
        error,
        page,
        hasMore,
        hasPrev: page > 1,
        next,
        prev,
        refresh,
        setPage,
    };
}
