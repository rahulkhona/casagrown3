import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { invokeFunction } from "./supabase/functions/_shared/test-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function run() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/confirm_order_delivery`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
            "apikey": SERVICE_ROLE_KEY
        },
        body: JSON.stringify({
            p_order_id: "00000000-0000-0000-0000-000000000000",
            p_buyer_id: "00000000-0000-0000-0000-000000000000"
        })
    });
    console.log(await res.text());
}
run();
