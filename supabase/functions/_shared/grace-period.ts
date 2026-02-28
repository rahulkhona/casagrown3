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
        .from("platform_settings")
        .select("provider_grace_period_ms")
        .limit(1)
        .maybeSingle();

    if (data?.provider_grace_period_ms != null) {
        return data.provider_grace_period_ms;
    }

    // Default: 30 minutes in milliseconds
    return 30 * 60 * 1000;
}
