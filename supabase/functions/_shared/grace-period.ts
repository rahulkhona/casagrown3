import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Fetches the currently configured grace period for disabled providers (in milliseconds).
 * This dictates how long a provider can continue processing queued or in-flight UI transactions
 * before it strictly aborts the request.
 *
 * Falls back to 30 minutes if not configured.
 */
export async function getProviderGracePeriodMs(
    supabase: SupabaseClient,
): Promise<number> {
    const { data } = await supabase
        .from("platform_config")
        .select("value")
        .eq("key", "provider_grace_period_ms")
        .maybeSingle();

    if (data?.value) {
        // Can be a string or number depending on DB storage formatting
        const parsed = parseInt(String(data.value), 10);
        if (!isNaN(parsed)) return parsed;
    }

    // Default: 30 minutes in milliseconds
    return 30 * 60 * 1000;
}
