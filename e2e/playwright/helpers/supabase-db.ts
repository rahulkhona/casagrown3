/**
 * Supabase REST helper for direct DB verification in admin tests.
 * Uses the service_role key to bypass RLS.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/**
 * Query a Supabase table via REST API.
 * Returns the parsed JSON array of rows.
 */
export async function dbQuery(
    table: string,
    queryParams: string = "",
): Promise<any[]> {
    const url = `${SUPABASE_URL}/rest/v1/${table}${queryParams ? `?${queryParams}` : ""}`;
    const res = await fetch(url, {
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
    });
    if (!res.ok) {
        throw new Error(
            `DB query failed: ${res.status} ${await res.text()}`,
        );
    }
    return res.json();
}

/**
 * Insert a row into a Supabase table. Returns inserted row.
 */
export async function dbInsert(
    table: string,
    data: Record<string, unknown>,
): Promise<any> {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        throw new Error(
            `DB insert failed: ${res.status} ${await res.text()}`,
        );
    }
    const rows = await res.json();
    return rows[0];
}

/**
 * Update rows in a Supabase table matching query params.
 */
export async function dbUpdate(
    table: string,
    queryParams: string,
    data: Record<string, unknown>,
): Promise<any[]> {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${queryParams}`;
    const res = await fetch(url, {
        method: "PATCH",
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        throw new Error(
            `DB update failed: ${res.status} ${await res.text()}`,
        );
    }
    return res.json();
}

/**
 * Delete rows from a Supabase table matching query params.
 */
export async function dbDelete(
    table: string,
    queryParams: string,
): Promise<void> {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${queryParams}`;
    const res = await fetch(url, {
        method: "DELETE",
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
    });
    if (!res.ok) {
        throw new Error(
            `DB delete failed: ${res.status} ${await res.text()}`,
        );
    }
}
