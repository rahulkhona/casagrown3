import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createShortLink } from "../_shared/short-links.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

Deno.test("crm_short_links: is_shared defaults to false on raw database insert", async () => {
  const token = Math.random().toString(36).slice(2, 10);
  
  // Insert without specifying is_shared
  const { data, error } = await supabase
    .from("crm_short_links")
    .insert({
      token,
      destination_url: "https://casagrown.com/test-default",
    })
    .select("is_shared")
    .single();

  assertEquals(error, null);
  assertEquals(data?.is_shared, false);

  // Clean up
  await supabase.from("crm_short_links").delete().eq("token", token);
});

Deno.test("crm_short_links: createShortLink helper always sets is_shared to true", async () => {
  const recipientId = "00000000-0000-0000-0000-000000000099";
  const token = await createShortLink(
    "https://casagrown.com/test-helper",
    recipientId,
    "lead",
    supabase
  );

  // Retrieve row and verify is_shared is true
  const { data, error } = await supabase
    .from("crm_short_links")
    .select("is_shared")
    .eq("token", token)
    .single();

  assertEquals(error, null);
  assertEquals(data?.is_shared, true);

  // Clean up
  await supabase.from("crm_short_links").delete().eq("token", token);
});

Deno.test("crm_short_links: can update is_shared from false to true", async () => {
  const token = Math.random().toString(36).slice(2, 10);

  // 1. Insert with default (false)
  await supabase
    .from("crm_short_links")
    .insert({
      token,
      destination_url: "https://casagrown.com/test-update",
    });

  // 2. Query and verify it is false
  let { data } = await supabase
    .from("crm_short_links")
    .select("is_shared")
    .eq("token", token)
    .single();
  assertEquals(data?.is_shared, false);

  // 3. Update to true
  const { error: updateError } = await supabase
    .from("crm_short_links")
    .update({ is_shared: true })
    .eq("token", token);
  assertEquals(updateError, null);

  // 4. Query and verify it is now true
  let { data: updatedData } = await supabase
    .from("crm_short_links")
    .select("is_shared")
    .eq("token", token)
    .single();
  assertEquals(updatedData?.is_shared, true);

  // Clean up
  await supabase.from("crm_short_links").delete().eq("token", token);
});

Deno.test("crm_short_links: querying with eq(is_shared, true) filters correctly", async () => {
  const token1 = "tok_filter_1_" + Math.random().toString(36).slice(2, 8);
  const token2 = "tok_filter_2_" + Math.random().toString(36).slice(2, 8);

  // Insert one shared and one unshared link
  await supabase.from("crm_short_links").insert([
    { token: token1, destination_url: "https://casagrown.com/shared", is_shared: true },
    { token: token2, destination_url: "https://casagrown.com/unshared", is_shared: false }
  ]);

  // Query only shared
  const { data: sharedList, error } = await supabase
    .from("crm_short_links")
    .select("token")
    .in("token", [token1, token2])
    .eq("is_shared", true);

  assertEquals(error, null);
  assertEquals(sharedList?.length, 1);
  assertEquals(sharedList?.[0]?.token, token1);

  // Clean up
  await supabase.from("crm_short_links").delete().in("token", [token1, token2]);
});
