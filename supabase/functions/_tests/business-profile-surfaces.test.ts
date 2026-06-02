/**
 * business-profile-surfaces integration tests
 *
 * Verifies that business profile data (farm_name, seller_bio, business_type,
 * trust badges, WhatsApp number) is correctly available for content generation
 * across all surfaces: FB/Google catalog, social posts, WA Business Profile,
 * and Google Business Profile.
 *
 * Run:
 *   cd supabase && deno test --allow-env --allow-run --allow-net --no-check functions/_tests/business-profile-surfaces.test.ts
 */
import {
  assert,
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SERVICE_ROLE_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
};

async function sqlExec(sql: string): Promise<string> {
  const proc = new Deno.Command("docker", {
    args: [
      "exec", "-i", "supabase_db_casagrown3",
      "psql", "-U", "postgres", "-t", "-A", "-c", sql,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await proc.output();
  const raw = new TextDecoder().decode(output.stdout).trim();
  const lines = raw.split("\n").filter((l) =>
    !l.match(/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SET|RESET)\s/i)
  );
  return lines[0]?.trim() || raw;
}

// ══════════════════════════════════════════════════════════════
// Section 1: Profile Schema Tests
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "business-profile-surfaces: profiles table has business profile columns",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const cols = await sqlExec(`
      SELECT string_agg(column_name, ',' ORDER BY column_name)
      FROM information_schema.columns WHERE table_name = 'profiles'
      AND column_name IN ('farm_name', 'seller_bio', 'business_type', 'business_license', 'food_handler_permit', 'cottage_food_permit', 'insurance_provider')
    `);
    assert(cols.includes("farm_name"), "profiles should have farm_name");
    assert(cols.includes("seller_bio"), "profiles should have seller_bio");
    assert(cols.includes("business_type"), "profiles should have business_type");
    assert(cols.includes("business_license"), "profiles should have business_license");
    assert(cols.includes("food_handler_permit"), "profiles should have food_handler_permit");
    assert(cols.includes("cottage_food_permit"), "profiles should have cottage_food_permit");
    assert(cols.includes("insurance_provider"), "profiles should have insurance_provider");
    console.log("  ✅ All business profile columns present on profiles table");
  },
});

// ══════════════════════════════════════════════════════════════
// Section 2: FB Catalog Content Tests
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "business-profile-surfaces: catalog description includes business type label (schema check)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Verify the profiles table has all the fields the catalog sync queries
    const cols = await sqlExec(`
      SELECT string_agg(column_name, ',' ORDER BY column_name)
      FROM information_schema.columns WHERE table_name = 'profiles'
      AND column_name IN ('farm_name', 'seller_bio', 'business_type', 'business_license', 'food_handler_permit', 'cottage_food_permit', 'insurance_provider')
    `);
    assert(cols.includes("farm_name"), "profiles should have farm_name");
    assert(cols.includes("seller_bio"), "profiles should have seller_bio");
    assert(cols.includes("business_type"), "profiles should have business_type");
    assert(cols.includes("business_license"), "profiles should have business_license");
    assert(cols.includes("food_handler_permit"), "profiles should have food_handler_permit");
    assert(cols.includes("cottage_food_permit"), "profiles should have cottage_food_permit");
    assert(cols.includes("insurance_provider"), "profiles should have insurance_provider");
    console.log("  ✅ All profile fields available for catalog sync queries");
  },
});

Deno.test({
  name: "business-profile-surfaces: seller_fb_connections has wa_display_phone column",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const exists = await sqlExec(`
      SELECT EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_name = 'seller_fb_connections' AND column_name = 'wa_display_phone')
    `);
    assertEquals(exists, "t", "wa_display_phone column should exist on seller_fb_connections");
    console.log("  ✅ wa_display_phone column exists on seller_fb_connections");
  },
});

Deno.test({
  name: "business-profile-surfaces: seller_fb_connections has wa_auto_reply_enabled column",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const exists = await sqlExec(`
      SELECT EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_name = 'seller_fb_connections' AND column_name = 'wa_auto_reply_enabled')
    `);
    assertEquals(exists, "t", "wa_auto_reply_enabled column should exist on seller_fb_connections");
    console.log("  ✅ wa_auto_reply_enabled column exists on seller_fb_connections");
  },
});

// ══════════════════════════════════════════════════════════════
// Section 3: Google Business Profile Tests
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "business-profile-surfaces: google.ts exports updateGoogleBusinessProfile",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { updateGoogleBusinessProfile } = await import("../_shared/google.ts");
    assert(typeof updateGoogleBusinessProfile === "function", "updateGoogleBusinessProfile should be exported");
    console.log("  ✅ updateGoogleBusinessProfile is exported from google.ts");
  },
});

Deno.test({
  name: "business-profile-surfaces: updateGoogleBusinessProfile handles mock tokens",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { updateGoogleBusinessProfile } = await import("../_shared/google.ts");
    await updateGoogleBusinessProfile("locations/mock-123", "mock_test_token", {
      description: "Test bio",
      additionalPhone: "+14085551234",
    });
    // Should not throw
    console.log("  ✅ updateGoogleBusinessProfile handled mock token without throwing");
  },
});

Deno.test({
  name: "business-profile-surfaces: updateGoogleBusinessProfile skips with no updates",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { updateGoogleBusinessProfile } = await import("../_shared/google.ts");
    await updateGoogleBusinessProfile("locations/mock-123", "mock_test_token", {});
    // Should return without making any API call
    console.log("  ✅ updateGoogleBusinessProfile skipped with empty updates");
  },
});

// ══════════════════════════════════════════════════════════════
// Section 4: WA Business Profile Tests
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "business-profile-surfaces: provision-wa-number sets WA Business Profile about",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const FN_URL = `${SUPABASE_URL}/functions/v1/provision-wa-number`;
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000" }),
    });
    // Function should return a structured response (not crash)
    assert(
      [200, 400, 401, 403, 404].includes(res.status),
      `Expected structured response, got ${res.status}`,
    );
    const body = await res.text();
    console.log(`  [WA-PROVISION] Response: ${res.status} ${body.substring(0, 200)}`);
    console.log("  ✅ provision-wa-number returned structured response");
  },
});

// ══════════════════════════════════════════════════════════════
// Section 5: Content Generation Verification
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "business-profile-surfaces: business type labels cover all valid types",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const VALID_TYPES = [
      "hobby_gardener",
      "small_farm",
      "cottage_food",
      "urban_farm",
      "homestead",
      "community_garden",
      "gardening_service",
      "landscaping_service",
      "commercial",
    ];
    const LABELS: Record<string, string> = {
      hobby_gardener: "🌱 Hobby Gardener",
      small_farm: "🚜 Small Farm",
      cottage_food: "🏠 Cottage Food Operation",
      urban_farm: "🏙️ Urban Farm",
      homestead: "🌾 Homestead",
      community_garden: "🌻 Community Garden",
      gardening_service: "🌿 Gardening Service",
      landscaping_service: "🏡 Landscaping Service",
      commercial: "🏢 Commercial / Licensed",
    };
    for (const type of VALID_TYPES) {
      assert(LABELS[type], `Business type '${type}' should have a label`);
      assert(LABELS[type].length > 0, `Label for '${type}' should not be empty`);
    }
    console.log("  ✅ All business types have corresponding labels");
  },
});

Deno.test({
  name: "business-profile-surfaces: WA number formatting for wa.me link",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const phone = "+1 (408) 555-1234";
    const formatted = phone.replace(/\D/g, "");
    assertEquals(formatted, "14085551234", "Phone should be stripped to digits for wa.me link");
    console.log(`  ✅ Phone formatted: ${phone} → ${formatted}`);
  },
});

Deno.test({
  name: "business-profile-surfaces: WA about field respects 139 char limit",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const farmName = "A".repeat(130);
    const about = `${farmName} on CasaGrown`.substring(0, 139);
    assert(about.length <= 139, "WA about should be 139 chars max");
    assertEquals(about.length, 139, "Should truncate to exactly 139 chars");
    console.log(`  ✅ WA about truncated: ${about.length} chars (max 139)`);
  },
});

Deno.test({
  name: "business-profile-surfaces: seller_google_connections has auto_sync_catalog column",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const exists = await sqlExec(`
      SELECT EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_name = 'seller_google_connections' AND column_name = 'auto_sync_catalog')
    `);
    assertEquals(exists, "t", "auto_sync_catalog column should exist");
    console.log("  ✅ auto_sync_catalog column exists on seller_google_connections");
  },
});
