import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

/** Generate a 6-digit numeric pairing code (manual entry fallback) */
function generatePairingCode(): string {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return String(array[0] % 1000000).padStart(6, "0");
}

/** Generate an 8-char alphanumeric delegation code prefixed with 'd-' for link slug */
function generateDelegationCode(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    return "d-" + Array.from(array).map((b) => chars[b % chars.length]).join(
        "",
    );
}

/** Default link expiry: 24 hours */
const LINK_EXPIRY_MS = 24 * 60 * 60 * 1000;

function jsonResponse(
    body: Record<string, unknown>,
    status = 200,
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        const { action, ...payload } = await req.json();

        // ── LOOKUP: Public — fetch delegator info for landing page ──
        // No auth required so the landing page can display delegator details
        if (action === "lookup") {
            const { code } = payload;
            if (!code || typeof code !== "string") {
                return jsonResponse({ error: "Missing delegation code" }, 400);
            }

            const { data: delegation, error: lookupError } = await supabaseAdmin
                .from("delegations")
                .select(
                    "id, delegator_id, status, message, pairing_code, pairing_expires_at, delegation_code",
                )
                .eq("delegation_code", code)
                .single();

            if (lookupError || !delegation) {
                return jsonResponse(
                    { error: "Delegation link not found" },
                    404,
                );
            }

            // Check expiry
            if (
                delegation.pairing_expires_at &&
                new Date(delegation.pairing_expires_at) < new Date()
            ) {
                return jsonResponse(
                    { error: "expired", expired: true },
                    410,
                );
            }

            // Check if already accepted (single-use)
            if (
                delegation.status === "active" ||
                delegation.status === "revoked"
            ) {
                return jsonResponse(
                    { error: "already_accepted", alreadyAccepted: true },
                    410,
                );
            }

            // Fetch delegator profile
            const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("id, full_name, avatar_url")
                .eq("id", delegation.delegator_id)
                .single();

            return jsonResponse({
                delegation: {
                    id: delegation.id,
                    message: delegation.message,
                    pairingCode: delegation.pairing_code,
                    expiresAt: delegation.pairing_expires_at,
                    delegationCode: delegation.delegation_code,
                },
                delegator: profile || {
                    id: delegation.delegator_id,
                    full_name: null,
                    avatar_url: null,
                },
            });
        }

        // ── All other actions require authentication ──
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return jsonResponse({ error: "Missing authorization header" }, 401);
        }

        const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: userError } = await supabaseUser.auth
            .getUser();
        if (userError || !user) {
            return jsonResponse({ error: "Unauthorized" }, 401);
        }

        // ── GENERATE-LINK: Create delegation with shareable link + passcode ──
        if (action === "generate-link") {
            const message = payload.message || null;

            // Check for an existing unexpired pending_pairing link from this delegator
            const { data: existing } = await supabaseAdmin
                .from("delegations")
                .select()
                .eq("delegator_id", user.id)
                .eq("status", "pending_pairing")
                .gt("pairing_expires_at", new Date().toISOString())
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (existing) {
                // Reuse the existing pending link — update message if provided
                if (message && message !== existing.message) {
                    await supabaseAdmin
                        .from("delegations")
                        .update({ message })
                        .eq("id", existing.id);
                }
                return jsonResponse({
                    delegationCode: existing.delegation_code,
                    pairingCode: existing.pairing_code,
                    expiresAt: existing.pairing_expires_at,
                    delegation: {
                        ...existing,
                        message: message || existing.message,
                    },
                });
            }

            // No existing link — create a new one
            const delegationCode = generateDelegationCode();
            const pairingCode = generatePairingCode();
            const expiresAt = new Date(Date.now() + LINK_EXPIRY_MS)
                .toISOString();

            const { data, error } = await supabaseAdmin
                .from("delegations")
                .insert({
                    delegator_id: user.id,
                    delegatee_id: null,
                    status: "pending_pairing",
                    delegation_code: delegationCode,
                    pairing_code: pairingCode,
                    pairing_expires_at: expiresAt,
                    message,
                })
                .select()
                .single();

            if (error) {
                // Retry once on unique constraint violation
                if (error.code === "23505") {
                    const retryCode = generateDelegationCode();
                    const retryPairing = generatePairingCode();
                    const { data: retryData, error: retryError } =
                        await supabaseAdmin
                            .from("delegations")
                            .insert({
                                delegator_id: user.id,
                                delegatee_id: null,
                                status: "pending_pairing",
                                delegation_code: retryCode,
                                pairing_code: retryPairing,
                                pairing_expires_at: expiresAt,
                                message,
                            })
                            .select()
                            .single();

                    if (retryError) {
                        return jsonResponse(
                            { error: "Failed to generate delegation link" },
                            500,
                        );
                    }

                    return jsonResponse({
                        delegationCode: retryCode,
                        pairingCode: retryPairing,
                        expiresAt,
                        delegation: retryData,
                    });
                }

                return jsonResponse({ error: error.message }, 500);
            }

            return jsonResponse({
                delegationCode,
                pairingCode,
                expiresAt,
                delegation: data,
            });
        }

        // ── ACCEPT-LINK: Accept delegation by delegation_code (from link) ──
        if (action === "accept-link") {
            const { code } = payload;
            if (!code || typeof code !== "string") {
                return jsonResponse(
                    { error: "Missing delegation code" },
                    400,
                );
            }

            // Find valid, non-expired delegation by code
            const { data: delegation, error: lookupError } = await supabaseAdmin
                .from("delegations")
                .select("*")
                .eq("delegation_code", code)
                .eq("status", "pending_pairing")
                .single();

            if (lookupError || !delegation) {
                return jsonResponse(
                    { error: "Invalid or expired delegation link" },
                    404,
                );
            }

            // Check expiry
            if (
                delegation.pairing_expires_at &&
                new Date(delegation.pairing_expires_at) < new Date()
            ) {
                return jsonResponse(
                    { error: "This delegation link has expired" },
                    410,
                );
            }

            // Prevent self-delegation
            if (delegation.delegator_id === user.id) {
                return jsonResponse(
                    { error: "Cannot delegate to yourself" },
                    400,
                );
            }

            // Accept: set delegatee, activate, clear codes (single-use)
            const { data: updated, error: updateError } = await supabaseAdmin
                .from("delegations")
                .update({
                    delegatee_id: user.id,
                    status: "active",
                    pairing_code: null,
                    pairing_expires_at: null,
                    // Keep delegation_code for reference but status change prevents reuse
                })
                .eq("id", delegation.id)
                .select()
                .single();

            if (updateError) {
                return jsonResponse(
                    { error: "Failed to accept delegation" },
                    500,
                );
            }

            return jsonResponse({ delegation: updated });
        }

        // ── ACCEPT (legacy): Accept by 6-digit pairing code (manual entry) ──
        if (action === "accept") {
            const { code } = payload;
            if (!code || typeof code !== "string" || code.length !== 6) {
                return jsonResponse(
                    { error: "Invalid pairing code format" },
                    400,
                );
            }

            const { data: delegation, error: lookupError } = await supabaseAdmin
                .from("delegations")
                .select("*")
                .eq("pairing_code", code)
                .eq("status", "pending_pairing")
                .gt("pairing_expires_at", new Date().toISOString())
                .single();

            if (lookupError || !delegation) {
                return jsonResponse(
                    { error: "Invalid or expired pairing code" },
                    404,
                );
            }

            if (delegation.delegator_id === user.id) {
                return jsonResponse(
                    { error: "Cannot delegate to yourself" },
                    400,
                );
            }

            const { data: updated, error: updateError } = await supabaseAdmin
                .from("delegations")
                .update({
                    delegatee_id: user.id,
                    status: "active",
                    pairing_code: null,
                    pairing_expires_at: null,
                })
                .eq("id", delegation.id)
                .select()
                .single();

            if (updateError) {
                return jsonResponse(
                    { error: "Failed to accept delegation" },
                    500,
                );
            }

            return jsonResponse({ delegation: updated });
        }

        // ── Legacy generate (kept for backward compat) ──
        if (action === "generate") {
            const pairingCode = generatePairingCode();
            const delegationCode = generateDelegationCode();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
                .toISOString();

            const { data, error } = await supabaseAdmin
                .from("delegations")
                .insert({
                    delegator_id: user.id,
                    delegatee_id: null,
                    status: "pending_pairing",
                    pairing_code: pairingCode,
                    delegation_code: delegationCode,
                    pairing_expires_at: expiresAt,
                })
                .select()
                .single();

            if (error) {
                return jsonResponse(
                    { error: "Failed to generate pairing code" },
                    500,
                );
            }

            return jsonResponse({
                code: pairingCode,
                expiresAt,
                delegation: data,
            });
        }

        return jsonResponse(
            {
                error:
                    'Unknown action. Use "generate-link", "lookup", "accept-link", or "accept".',
            },
            400,
        );
    } catch (err) {
        return jsonResponse({ error: "Internal server error" }, 500);
    }
});
