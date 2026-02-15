/**
 * pair-delegation — Supabase Edge Function
 *
 * Multi-action router for delegated sales:
 *   - generate-link: Create delegation with shareable link + passcode
 *   - lookup: Public — fetch delegator info for landing page
 *   - accept-link: Accept delegation by delegation_code
 *   - accept: Accept by 6-digit pairing code (manual entry)
 *   - generate: Legacy generate (backward compat)
 */

import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Main handler ────────────────────────────────────────────────────────────

serveWithCors(async (req, { supabase: supabaseAdmin, corsHeaders }) => {
    const { action, ...payload } = await req.json();

    // ── LOOKUP: Public — fetch delegator info for landing page ───────────
    // No auth required so the landing page can display delegator details
    if (action === "lookup") {
        const { code } = payload;
        if (!code || typeof code !== "string") {
            return jsonError("Missing delegation code", corsHeaders, 400);
        }

        const { data: delegation, error: lookupError } = await supabaseAdmin
            .from("delegations")
            .select(
                "id, delegator_id, status, message, pairing_code, pairing_expires_at, delegation_code",
            )
            .eq("delegation_code", code)
            .single();

        if (lookupError || !delegation) {
            return jsonError("Delegation link not found", corsHeaders, 404);
        }

        // Check expiry
        if (
            delegation.pairing_expires_at &&
            new Date(delegation.pairing_expires_at) < new Date()
        ) {
            return jsonError("expired", corsHeaders, 410);
        }

        // Check if already accepted (single-use)
        if (
            delegation.status === "active" ||
            delegation.status === "revoked"
        ) {
            return jsonError("already_accepted", corsHeaders, 410);
        }

        // Fetch delegator profile
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, avatar_url")
            .eq("id", delegation.delegator_id)
            .single();

        return jsonOk(
            {
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
            },
            corsHeaders,
        );
    }

    // ── All other actions require authentication ────────────────────────
    const auth = await requireAuth(req, supabaseAdmin, corsHeaders);
    if (auth instanceof Response) return auth; // 401
    const userId = auth;

    // ── GENERATE-LINK: Create delegation with shareable link + passcode ──
    if (action === "generate-link") {
        const message = payload.message || null;

        // Check for an existing unexpired pending_pairing link from this delegator
        const { data: existing } = await supabaseAdmin
            .from("delegations")
            .select()
            .eq("delegator_id", userId)
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
            return jsonOk(
                {
                    delegationCode: existing.delegation_code,
                    pairingCode: existing.pairing_code,
                    expiresAt: existing.pairing_expires_at,
                    delegation: {
                        ...existing,
                        message: message || existing.message,
                    },
                },
                corsHeaders,
            );
        }

        // No existing link — create a new one
        const delegationCode = generateDelegationCode();
        const pairingCode = generatePairingCode();
        const expiresAt = new Date(Date.now() + LINK_EXPIRY_MS).toISOString();

        const { data, error } = await supabaseAdmin
            .from("delegations")
            .insert({
                delegator_id: userId,
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
                            delegator_id: userId,
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
                    return jsonError(
                        "Failed to generate delegation link",
                        corsHeaders,
                        500,
                    );
                }

                return jsonOk(
                    {
                        delegationCode: retryCode,
                        pairingCode: retryPairing,
                        expiresAt,
                        delegation: retryData,
                    },
                    corsHeaders,
                );
            }

            return jsonError(error.message, corsHeaders, 500);
        }

        return jsonOk(
            { delegationCode, pairingCode, expiresAt, delegation: data },
            corsHeaders,
        );
    }

    // ── ACCEPT-LINK: Accept delegation by delegation_code (from link) ───
    if (action === "accept-link") {
        const { code } = payload;
        if (!code || typeof code !== "string") {
            return jsonError("Missing delegation code", corsHeaders, 400);
        }

        const { data: delegation, error: lookupError } = await supabaseAdmin
            .from("delegations")
            .select("*")
            .eq("delegation_code", code)
            .eq("status", "pending_pairing")
            .single();

        if (lookupError || !delegation) {
            return jsonError(
                "Invalid or expired delegation link",
                corsHeaders,
                404,
            );
        }

        // Check expiry
        if (
            delegation.pairing_expires_at &&
            new Date(delegation.pairing_expires_at) < new Date()
        ) {
            return jsonError(
                "This delegation link has expired",
                corsHeaders,
                410,
            );
        }

        // Prevent self-delegation
        if (delegation.delegator_id === userId) {
            return jsonError(
                "Cannot delegate to yourself",
                corsHeaders,
                400,
            );
        }

        // Accept: set delegatee, activate, clear codes (single-use)
        const { data: updated, error: updateError } = await supabaseAdmin
            .from("delegations")
            .update({
                delegatee_id: userId,
                status: "active",
                pairing_code: null,
                pairing_expires_at: null,
            })
            .eq("id", delegation.id)
            .select()
            .single();

        if (updateError) {
            return jsonError(
                "Failed to accept delegation",
                corsHeaders,
                500,
            );
        }

        return jsonOk({ delegation: updated }, corsHeaders);
    }

    // ── ACCEPT (legacy): Accept by 6-digit pairing code (manual entry) ──
    if (action === "accept") {
        const { code } = payload;
        if (!code || typeof code !== "string" || code.length !== 6) {
            return jsonError(
                "Invalid pairing code format",
                corsHeaders,
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
            return jsonError(
                "Invalid or expired pairing code",
                corsHeaders,
                404,
            );
        }

        if (delegation.delegator_id === userId) {
            return jsonError(
                "Cannot delegate to yourself",
                corsHeaders,
                400,
            );
        }

        const { data: updated, error: updateError } = await supabaseAdmin
            .from("delegations")
            .update({
                delegatee_id: userId,
                status: "active",
                pairing_code: null,
                pairing_expires_at: null,
            })
            .eq("id", delegation.id)
            .select()
            .single();

        if (updateError) {
            return jsonError(
                "Failed to accept delegation",
                corsHeaders,
                500,
            );
        }

        return jsonOk({ delegation: updated }, corsHeaders);
    }

    // ── Legacy generate (kept for backward compat) ──────────────────────
    if (action === "generate") {
        const pairingCode = generatePairingCode();
        const delegationCode = generateDelegationCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        const { data, error } = await supabaseAdmin
            .from("delegations")
            .insert({
                delegator_id: userId,
                delegatee_id: null,
                status: "pending_pairing",
                pairing_code: pairingCode,
                delegation_code: delegationCode,
                pairing_expires_at: expiresAt,
            })
            .select()
            .single();

        if (error) {
            return jsonError(
                "Failed to generate pairing code",
                corsHeaders,
                500,
            );
        }

        return jsonOk(
            { code: pairingCode, expiresAt, delegation: data },
            corsHeaders,
        );
    }

    return jsonError(
        'Unknown action. Use "generate-link", "lookup", "accept-link", or "accept".',
        corsHeaders,
        400,
    );
}, { errorStatus: 500 });
