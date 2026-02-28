/**
 * fetch-donation-projects — Edge Function to fetch charitable projects
 *
 * Fetches active projects from GlobalGiving's public API,
 * maps them to the format expected by the Donate tab UI,
 * and caches results for 24 hours.
 *
 * Falls back to mock data if the API key is not configured
 * or the API request fails.
 */

import { jsonOk, serveWithCors } from "../_shared/serve-with-cors.ts";

interface DonationProject {
    id: number;
    title: string;
    organization: string;
    theme: string;
    imageUrl: string;
    goal: number;
    raised: number;
    summary: string;
}

// Removed FALLBACK_PROJECTS per user request to ensure strict API usage

// ── Theme mapping ──────────────────────────────────────────────────

function mapGlobalGivingTheme(themes: string[]): string {
    const joined = (themes || []).join(" ").toLowerCase();
    if (joined.includes("hunger") || joined.includes("food")) return "Hunger";
    if (joined.includes("environment") || joined.includes("climate")) {
        return "Environment";
    }
    if (joined.includes("education") || joined.includes("children")) {
        return "Education";
    }
    if (joined.includes("health") || joined.includes("medical")) {
        return "Health";
    }
    if (joined.includes("water") || joined.includes("sanitation")) {
        return "Health";
    }
    return "Other";
}

// ── Main Handler ───────────────────────────────────────────────────

serveWithCors(async (_req, { supabase, env, corsHeaders }) => {
    // ── Parse search query from URL or POST body ──
    const url = new URL(_req.url);
    let searchQuery = url.searchParams.get("q")?.trim() || "";

    // Also check POST body (used by supabase.functions.invoke)
    if (!searchQuery && _req.method === "POST") {
        try {
            const body = await _req.json();
            searchQuery = (body?.q || "").trim();
        } catch { /* not JSON */ }
    }

    const apiKey = env("GLOBALGIVING_API_KEY");

    // ── SEARCH MODE: call GlobalGiving search API ──
    if (searchQuery && searchQuery.length >= 2) {
        if (!apiKey) {
            return jsonOk({
                error: "Missing GLOBALGIVING_API_KEY",
                projects: [],
            }, corsHeaders);
        }

        try {
            const MAX_SEARCH_PROJECTS = 100;
            // deno-lint-ignore no-explicit-any
            const allRawSearchProjects: any[] = [];
            let nextProjectId = 0;

            for (
                let page = 0;
                page < 10 && allRawSearchProjects.length < MAX_SEARCH_PROJECTS;
                page++
            ) {
                const searchUrl = nextProjectId
                    ? `https://api.globalgiving.org/api/public/services/search/projects?api_key=${apiKey}&q=${
                        encodeURIComponent(searchQuery)
                    }&nextProjectId=${nextProjectId}`
                    : `https://api.globalgiving.org/api/public/services/search/projects?api_key=${apiKey}&q=${
                        encodeURIComponent(searchQuery)
                    }`;

                const res = await fetch(searchUrl, {
                    headers: { "Accept": "application/json" },
                });

                if (!res.ok) {
                    console.error(
                        `[DONATIONS] Search API error: ${res.status}`,
                    );
                    return jsonOk(
                        {
                            projects: [],
                            cached: false,
                            search: true,
                            query: searchQuery,
                            error: `API ${res.status}`,
                        },
                        corsHeaders,
                    );
                }

                const data = await res.json();
                const projectsObj = data.search?.response?.projects;
                const pageProjects = Array.isArray(projectsObj?.project)
                    ? projectsObj.project
                    : (projectsObj?.project ? [projectsObj.project] : []);

                if (pageProjects.length === 0) break;

                allRawSearchProjects.push(...pageProjects);

                nextProjectId = data.search?.response?.projects?.nextProjectId;
                if (!nextProjectId) break;
            }

            const projects: DonationProject[] = allRawSearchProjects.slice(
                0,
                100,
            ).map(
                // deno-lint-ignore no-explicit-any
                (p: any) => ({
                    id: Number(p.id),
                    title: p.title || p.projectLink,
                    organization: p.organization?.name || p.organizationName ||
                        "Unknown",
                    theme: mapGlobalGivingTheme(
                        p.themes?.theme?.map((t: any) => t.name) || [],
                    ),
                    imageUrl: p.imageLink ||
                        p.image?.imagelink?.find((img: any) =>
                            img.size === "medium"
                        )?.url || "",
                    goal: Math.round(Number(p.goal || 0)),
                    raised: Math.round(Number(p.funding || 0)),
                    summary: (p.summary || p.activities || "").substring(
                        0,
                        200,
                    ),
                }),
            );

            console.log(
                `[DONATIONS] Search "${searchQuery}" returned ${projects.length} results`,
            );

            return jsonOk(
                {
                    projects,
                    cached: false,
                    search: true,
                    query: searchQuery,
                    count: projects.length,
                },
                corsHeaders,
            );
        } catch (err) {
            console.error("[DONATIONS] Search failed:", err);
            return jsonOk(
                {
                    projects: [],
                    cached: false,
                    search: true,
                    query: searchQuery,
                    error: String(err),
                },
                corsHeaders,
            );
        }
    }

    // ── BROWSE MODE: return cached/paginated projects ──

    // Check cache
    const { data: cached } = await supabase
        .from("charity_projects_cache")
        .select("data, updated_at")
        .limit(1)
        .maybeSingle();

    if (cached) {
        const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
        const CACHE_TTL = 24 * 60 * 60 * 1000;

        if (cacheAge < CACHE_TTL) {
            const projects = cached.data as DonationProject[];
            return jsonOk(
                { projects, cached: true, count: projects.length },
                corsHeaders,
            );
        }
    }

    if (!apiKey) {
        return jsonOk(
            { error: "Missing GLOBALGIVING_API_KEY", projects: [] },
            corsHeaders,
        );
    }

    try {
        const MAX_PROJECTS = 100;
        // deno-lint-ignore no-explicit-any
        const allRawProjects: any[] = [];
        let nextProjectId = 0;

        // Paginate through GlobalGiving API (each page returns ~10 projects)
        for (
            let page = 0;
            page < 10 && allRawProjects.length < MAX_PROJECTS;
            page++
        ) {
            const url = nextProjectId
                ? `https://api.globalgiving.org/api/public/projectservice/all/projects/active?api_key=${apiKey}&nextProjectId=${nextProjectId}`
                : `https://api.globalgiving.org/api/public/projectservice/all/projects/active?api_key=${apiKey}`;
            const res = await fetch(url, {
                headers: { "Accept": "application/json" },
            });

            if (!res.ok) {
                if (page === 0) {
                    throw new Error(
                        `GlobalGiving API ${res.status}: ${await res.text()}`,
                    );
                }
                break; // Got some projects, stop paginating
            }

            const data = await res.json();
            const pageProjects = data.projects?.project || [];
            if (pageProjects.length === 0) break;

            allRawProjects.push(...pageProjects);

            // Get next page cursor
            nextProjectId = data.projects?.nextProjectId;
            if (!nextProjectId) break;
        }

        const projects: DonationProject[] = allRawProjects
            .slice(0, MAX_PROJECTS)
            // deno-lint-ignore no-explicit-any
            .map((p: any) => ({
                id: Number(p.id),
                title: p.title || p.projectLink,
                organization: p.organization?.name || "Unknown",
                theme: mapGlobalGivingTheme(
                    p.themes?.theme?.map((t: any) => t.name) || [],
                ),
                imageUrl: p.imageLink ||
                    p.image?.imagelink?.find((img: any) =>
                        img.size === "medium"
                    )?.url || "",
                goal: Math.round(Number(p.goal || 0)),
                raised: Math.round(Number(p.funding || 0)),
                summary: (p.summary || p.activities || "").substring(0, 200),
            }));

        console.log(
            `[DONATIONS] Fetched ${projects.length} projects from GlobalGiving`,
        );

        // Cache results
        if (projects.length > 0) {
            // Upsert the single cache row (or insert if empty)
            const { data: existingCache } = await supabase
                .from("charity_projects_cache")
                .select("id")
                .limit(1)
                .maybeSingle();

            if (existingCache?.id) {
                await supabase
                    .from("charity_projects_cache")
                    .update({
                        data: projects,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", existingCache.id);
            } else {
                await supabase
                    .from("charity_projects_cache")
                    .insert({
                        data: projects,
                        updated_at: new Date().toISOString(),
                    });
            }
        }

        return jsonOk(
            { projects, cached: false, count: projects.length },
            corsHeaders,
        );
    } catch (err) {
        console.error("[DONATIONS] GlobalGiving fetch failed:", err);
        return jsonOk(
            {
                projects: [],
                cached: false,
                fallback: false,
                error: err instanceof Error ? err.message : "Unknown error",
            },
            corsHeaders,
        );
    }
});
