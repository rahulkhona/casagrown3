/**
 * serve-with-cors.ts — Shared edge-function middleware
 *
 * Handles CORS headers, OPTIONS preflight, Supabase client initialization,
 * and top-level error wrapping so individual functions only contain
 * business logic.
 *
 * Usage:
 *   import { serveWithCors, requireAuth } from "../_shared/serve-with-cors.ts";
 *
 *   serveWithCors(async (req, { supabase, env, corsHeaders }) => {
 *     const userId = await requireAuth(req, supabase, corsHeaders);
 *     // ... business logic ...
 *     return jsonOk({ result: "done" }, corsHeaders);
 *   });
 */

import {
    createClient,
    type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

// ── Standard CORS headers ──────────────────────────────────────────────────

const DEFAULT_CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface HandlerContext {
    /** Pre-initialized Supabase client (service role) */
    supabase: SupabaseClient;
    /** Typed environment variable accessor. Throws if key is missing when `required = true`. */
    env: (key: string, required?: boolean) => string | undefined;
    /** CORS headers (includes any extra headers from options) */
    corsHeaders: Record<string, string>;
}

export interface ServeOptions {
    /** Additional CORS header values to merge (e.g. "stripe-signature") */
    extraCorsHeaders?: string;
    /** HTTP status for uncaught errors (default: 400) */
    errorStatus?: number;
}

// ── Main wrapper ───────────────────────────────────────────────────────────

export function serveWithCors(
    handler: (req: Request, ctx: HandlerContext) => Promise<Response>,
    options?: ServeOptions,
): void {
    const corsHeaders = { ...DEFAULT_CORS_HEADERS };
    if (options?.extraCorsHeaders) {
        corsHeaders["Access-Control-Allow-Headers"] +=
            `, ${options.extraCorsHeaders}`;
    }

    Deno.serve(async (req: Request) => {
        // Handle preflight
        if (req.method === "OPTIONS") {
            return new Response("ok", { headers: corsHeaders });
        }

        try {
            // Initialize Supabase client
            const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
            const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
                "SUPABASE_SERVICE_ROLE_KEY",
            );

            if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
                throw new Error("Missing Supabase credentials");
            }

            const supabase = createClient(
                SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY,
            );

            const env = (key: string, required = false): string | undefined => {
                const val = Deno.env.get(key);
                if (required && !val) {
                    throw new Error(`Missing required env var: ${key}`);
                }
                return val;
            };

            return await handler(req, { supabase, env, corsHeaders });
        } catch (error: unknown) {
            const message = error instanceof Error
                ? error.message
                : "Unknown error";
            console.error("Edge function error:", error);
            return new Response(
                JSON.stringify({ error: message }),
                {
                    status: options?.errorStatus ?? 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }
    });
}

// ── Auth helper ────────────────────────────────────────────────────────────

/**
 * Extract and verify the authenticated user from the Authorization header.
 *
 * Returns the user ID string on success.
 * Throws an `AuthError` (with a pre-built 401 Response) on failure,
 * which the caller should return directly.
 *
 * Usage:
 *   const auth = await requireAuth(req, supabase, corsHeaders);
 *   if (auth instanceof Response) return auth;  // 401
 *   const userId = auth;
 */
export async function requireAuth(
    req: Request,
    supabase: SupabaseClient,
    corsHeaders: Record<string, string>,
): Promise<string | Response> {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user?.id) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    return user.id;
}

// ── JSON response helpers ──────────────────────────────────────────────────

/** Convenience: return a JSON 200 response with CORS headers */
export function jsonOk(
    body: Record<string, unknown>,
    corsHeaders: Record<string, string>,
    status = 200,
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

/** Convenience: return a JSON error response with CORS headers */
export function jsonError(
    message: string,
    corsHeaders: Record<string, string>,
    status = 400,
): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
