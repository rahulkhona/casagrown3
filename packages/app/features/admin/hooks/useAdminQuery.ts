import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@casagrown/app/utils/supabase";

export interface UseAdminQueryOptions {
    table: string;
    select?: string;
    pageSize?: number;
    defaultSortParams?: { column: string; ascending: boolean };
    filterColumn?: string;
    filterValue?: string;
    /** Exact-match filters applied via .eq() */
    filters?: Record<string, string>;
}

export function useAdminQuery<T = any>({
    table,
    select: selectClause = '*',
    pageSize = 20,
    defaultSortParams,
    filterColumn,
    filterValue,
    filters,
}: UseAdminQueryOptions) {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sortColumn = defaultSortParams?.column;
    const sortAscending = defaultSortParams?.ascending;

    // Stabilize filters to prevent infinite re-renders
    const filtersKey = useMemo(() => JSON.stringify(filters || {}), [filters]);

    const fetchData = useCallback(async (currentPage: number) => {
        setLoading(true);
        setError(null);
        try {
            let query = supabase
                .from(table)
                .select(selectClause, { count: "exact" });

            if (filterColumn && filterValue) {
                // Simple ilike text filter for search
                query = query.ilike(filterColumn, `%${filterValue}%`);
            }

            // Apply exact-match filters
            const parsedFilters = filtersKey ? JSON.parse(filtersKey) : {};
            for (const [col, val] of Object.entries(parsedFilters)) {
                if (val) query = query.eq(col, val as string);
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

            if (fetchError) throw new Error(fetchError.message || JSON.stringify(fetchError));

            setData(result as unknown as T[]);
            setHasMore(count ? (from + result.length) < count : false);
        } catch (e: any) {
            console.error(`Error fetching admin data for ${table}:`, e?.message || e);
            setError(e.message || 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [table, selectClause, pageSize, sortColumn, sortAscending, filterColumn, filterValue, filtersKey]);

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
