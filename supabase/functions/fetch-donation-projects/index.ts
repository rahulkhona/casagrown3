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

// ── Mock fallback data ─────────────────────────────────────────────

const FALLBACK_PROJECTS: DonationProject[] = [
    {
        id: 1001,
        title: "Feed Families in Rural Communities",
        organization: "Food For All Foundation",
        theme: "Hunger",
        imageUrl:
            "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=400",
        goal: 20000,
        raised: 13400,
        summary:
            "Providing fresh meals and produce to underserved rural families.",
    },
    {
        id: 1002,
        title: "Community Garden Reforestation",
        organization: "Green Earth Initiative",
        theme: "Environment",
        imageUrl:
            "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400",
        goal: 15000,
        raised: 6750,
        summary:
            "Planting trees and restoring community garden spaces across the region.",
    },
    {
        id: 1003,
        title: "After-School Garden Program",
        organization: "Future Leaders Co.",
        theme: "Education",
        imageUrl:
            "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=400",
        goal: 10000,
        raised: 8800,
        summary:
            "Teaching kids sustainable gardening and nutrition after school.",
    },
    {
        id: 1004,
        title: "Nutritious School Lunches",
        organization: "Healthy Kids Now",
        theme: "Health",
        imageUrl:
            "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
        goal: 25000,
        raised: 6250,
        summary: "Supplying fresh, locally-grown lunches to schools in need.",
    },
];

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
            // Fallback: filter mock data locally
            const filtered = FALLBACK_PROJECTS.filter((p) =>
                p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.organization.toLowerCase().includes(searchQuery.toLowerCase())
            );
            return jsonOk(
                {
                    projects: filtered,
                    cached: false,
                    search: true,
                    query: searchQuery,
                },
                corsHeaders,
            );
        }

        try {
            const searchUrl =
                `https://api.globalgiving.org/api/public/services/search/projects?api_key=${apiKey}&q=${
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
            const rawProjects = data.search?.response?.projects?.project ||
                [];

            const projects: DonationProject[] = rawProjects.slice(0, 30).map(
                (p: any) => ({
                    id: p.id,
                    title: p.title || p.projectLink,
                    organization: p.organization?.name || "Unknown",
                    theme: mapGlobalGivingTheme(
                        p.themes?.theme?.map((t: any) => t.name) || [],
                    ),
                    imageUrl: p.imageLink ||
                        p.image?.imagelink?.find((img: any) =>
                            img.size === "medium"
                        )?.url || "",
                    goal: Math.round(p.goal || 0),
                    raised: Math.round(p.funding || 0),
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
        .from("platform_config")
        .select("value, updated_at")
        .eq("key", "donation_projects_v1")
        .maybeSingle();

    if (cached) {
        const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
        const CACHE_TTL = 24 * 60 * 60 * 1000;

        if (cacheAge < CACHE_TTL) {
            const projects = JSON.parse(cached.value) as DonationProject[];
            return jsonOk(
                { projects, cached: true, count: projects.length },
                corsHeaders,
            );
        }
    }

    // Fetch from GlobalGiving
    if (!apiKey) {
        console.warn(
            "[DONATIONS] No GLOBALGIVING_API_KEY — returning fallback data",
        );
        return jsonOk(
            { projects: FALLBACK_PROJECTS, cached: false, fallback: true },
            corsHeaders,
        );
    }

    try {
        const MAX_PROJECTS = 100;
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
            .map((p: any) => ({
                id: p.id,
                title: p.title || p.projectLink,
                organization: p.organization?.name || "Unknown",
                theme: mapGlobalGivingTheme(
                    p.themes?.theme?.map((t: any) => t.name) || [],
                ),
                imageUrl: p.imageLink ||
                    p.image?.imagelink?.find((img: any) =>
                        img.size === "medium"
                    )?.url || "",
                goal: Math.round(p.goal || 0),
                raised: Math.round(p.funding || 0),
                summary: (p.summary || p.activities || "").substring(0, 200),
            }));

        console.log(
            `[DONATIONS] Fetched ${projects.length} projects from GlobalGiving`,
        );

        // Cache results
        if (projects.length > 0) {
            await supabase
                .from("platform_config")
                .upsert({
                    key: "donation_projects_v1",
                    value: JSON.stringify(projects),
                    updated_at: new Date().toISOString(),
                }, { onConflict: "key" });
        }

        return jsonOk(
            { projects, cached: false, count: projects.length },
            corsHeaders,
        );
    } catch (err) {
        console.error("[DONATIONS] GlobalGiving fetch failed:", err);
        return jsonOk(
            {
                projects: FALLBACK_PROJECTS,
                cached: false,
                fallback: true,
                error: err instanceof Error ? err.message : "Unknown error",
            },
            corsHeaders,
        );
    }
});
