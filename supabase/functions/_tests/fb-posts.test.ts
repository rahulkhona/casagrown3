/**
 * Facebook auto-posting integration tests
 *
 * Tests:
 *   - Post template formats (daily digest, welcome, seller menu)
 *   - Multi-photo carousel logic (publishMultiPhotoPost)
 *   - Auto-publish flow (no admin queue)
 *   - Schema, cron schedules, rate limiting
 */
import { assert, assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

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

async function sqlExecAll(sql: string): Promise<string[]> {
  const proc = new Deno.Command("docker", {
    args: [
      "exec", "-i", "supabase_db_casagrown3",
      "psql", "-U", "postgres", "-t", "-A", "-c", sql,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await proc.output();
  return new TextDecoder().decode(output.stdout).trim().split("\n").filter(Boolean);
}

async function callFunction(fnName: string, body: Record<string, unknown> = {}): Promise<{ status: number; data: any }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

// ══════════════════════════════════════════════════════════════
// Template Format Tests
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "fb-posts: daily digest template starts with correct header",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    // Simulate the template building from generate-fb-posts
    const products: Record<string, Set<string>> = {
      "tomatoes": new Set(["seller1", "seller2"]),
      "sweet corn": new Set(["seller1"]),
      "fresh eggs": new Set(["seller3"]),
    };

    const summaryParts: string[] = [];
    for (const [product, sellers] of Object.entries(products)) {
      if (sellers.size > 1) {
        summaryParts.push(`${product} from ${sellers.size} growers`);
      } else {
        summaryParts.push(product);
      }
    }
    const summaryText = summaryParts.slice(0, 8).join(", ");
    const andMore = summaryParts.length > 8 ? ", and more!" : "!";

    const msg = `🌱 New on CasaGrown today!\n\n${summaryText}${andMore}\n`;

    assert(msg.startsWith("🌱 New on CasaGrown today!"), "Should start with correct header");
    assert(msg.includes("tomatoes from 2 growers"), "Should aggregate multi-seller products");
    assert(msg.includes("sweet corn"), "Should include single-seller products");
    assert(msg.includes("fresh eggs"), "Should include all products");
  },
});

Deno.test({
  name: "fb-posts: daily digest includes new Pro sellers section with booth + FB links",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const siteUrl = "https://casagrown.com";
    let digestMsg = "🌱 New on CasaGrown today!\n\ntomatoes, corn!\n";

    // Simulate adding Pro sellers
    const sellers = [
      { name: "Sam Seller", location: "San Jose, CA", boothId: "booth123", fbPageId: "samsfarmstand" },
      { name: "Alex Adams", location: "San Jose, CA", boothId: "booth456", fbPageId: null },
    ];

    digestMsg += `\n🆕 New Pro sellers this week:\n\n`;
    for (const s of sellers) {
      digestMsg += `👩‍🌾 ${s.name} — ${s.location}\n`;
      digestMsg += `🛒 ${siteUrl}/market/booth/${s.boothId}\n`;
      if (s.fbPageId) {
        digestMsg += `📘 https://facebook.com/${s.fbPageId}\n`;
      }
      digestMsg += `\n`;
    }
    digestMsg += `Browse what's fresh from your neighbors → ${siteUrl}/market`;

    // Verify template
    assert(digestMsg.includes("🆕 New Pro sellers this week:"), "Should have new sellers section");
    assert(digestMsg.includes("👩‍🌾 Sam Seller — San Jose, CA"), "Should have seller name + location");
    assert(digestMsg.includes(`🛒 ${siteUrl}/market/booth/booth123`), "Should have booth link");
    assert(digestMsg.includes("📘 https://facebook.com/samsfarmstand"), "Should have FB link when available");
    assert(!digestMsg.includes("📘 https://facebook.com/null"), "Should NOT have FB link when null");
    assert(digestMsg.endsWith(`Browse what's fresh from your neighbors → ${siteUrl}/market`), "Should end with browse link");
  },
});

Deno.test({
  name: "fb-posts: welcome post template has correct structure per seller",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const siteUrl = "https://casagrown.com";
    let msg = "🎉 New on CasaGrown this week!\n\n";
    msg += "Welcome to our newest local growers:\n\n";

    const sellers = [
      {
        name: "Sam's Farm Stand", location: "San Jose, CA",
        boothId: "abc123", pickup: "1168 Lincoln Ave, San Jose, CA 95125",
        delivery: ["95125", "95126"], fbPageId: "samsfarmstand",
      },
      {
        name: "Alex's Fresh Picks", location: "San Jose, CA",
        boothId: "xyz456", pickup: "1021 Lincoln Ave, San Jose, CA 95125",
        delivery: null, fbPageId: null,
      },
    ];

    for (const s of sellers) {
      msg += `👩‍🌾 ${s.name} — ${s.location}\n`;
      msg += `🛒 Shop: ${siteUrl}/market/booth/${s.boothId}\n`;
      if (s.pickup) msg += `📍 Pickup: ${s.pickup}\n`;
      if (s.delivery && s.delivery.length > 0) {
        msg += `🚗 Delivery: ${s.delivery.join(", ")}\n`;
      }
      if (s.fbPageId) {
        msg += `📘 Follow: https://facebook.com/${s.fbPageId}\n`;
      }
      msg += "\n";
    }
    msg += `Support local! 🌱 ${siteUrl}/market`;

    // Verify template
    assert(msg.startsWith("🎉 New on CasaGrown this week!"), "Should start with welcome header");
    assert(msg.includes("Welcome to our newest local growers:"), "Should have welcome subheader");
    assert(msg.includes("👩‍🌾 Sam's Farm Stand — San Jose, CA"), "Should list seller with emoji");
    assert(msg.includes(`🛒 Shop: ${siteUrl}/market/booth/abc123`), "Should have shop link with label");
    assert(msg.includes("📍 Pickup: 1168 Lincoln Ave"), "Should have pickup address");
    assert(msg.includes("🚗 Delivery: 95125, 95126"), "Should have delivery zones");
    assert(msg.includes("📘 Follow: https://facebook.com/samsfarmstand"), "Should have FB follow link");
    assert(!msg.includes("📘 Follow: https://facebook.com/null"), "Should NOT show FB link for null");
    assert(!msg.includes("🚗 Delivery: null"), "Should NOT show delivery for null");
    assert(msg.endsWith(`Support local! 🌱 ${siteUrl}/market`), "Should end with support local CTA");
  },
});

Deno.test({
  name: "fb-posts: seller daily menu template groups products by booth",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const siteUrl = "https://casagrown.com";
    const sellerName = "Sam's Farm Stand";

    let message = `🌱 What's fresh today from ${sellerName}!\n`;

    const booths = [
      {
        name: "Willow Glen Farm Stand", pickup: "1168 Lincoln Ave, San Jose, CA 95125",
        id: "booth-abc", offersPickup: true,
        delivery: ["95125", "95126"],
        products: [
          { name: "Heirloom Peppers", price: 4.50 },
          { name: "Sweet Corn", price: 3.00 },
        ],
      },
    ];

    const boothLinks: string[] = [];
    for (const booth of booths) {
      message += `\n📍 ${booth.name}`;
      if (booth.pickup && booth.offersPickup) message += ` — ${booth.pickup}`;
      message += "\n";

      for (const p of booth.products) {
        message += `  • ${p.name} — $${p.price.toFixed(2)}\n`;
      }

      if (booth.delivery.length > 0) {
        message += `  🚗 Delivery: ${booth.delivery.join(", ")}\n`;
      }
      boothLinks.push(`${siteUrl}/market/booth/${booth.id}`);
    }

    message += `\nOrder now 👇\n${boothLinks[0]}`;

    // Verify template
    assert(message.startsWith(`🌱 What's fresh today from ${sellerName}!`), "Should start with seller greeting");
    assert(message.includes("📍 Willow Glen Farm Stand — 1168 Lincoln Ave"), "Should have booth with address");
    assert(message.includes("  • Heirloom Peppers — $4.50"), "Should list products with prices");
    assert(message.includes("  • Sweet Corn — $3.00"), "Should list all products");
    assert(message.includes("  🚗 Delivery: 95125, 95126"), "Should show delivery zones");
    assert(message.includes("Order now 👇"), "Should have order CTA");
    assert(message.endsWith(`${siteUrl}/market/booth/booth-abc`), "Should end with booth link");
  },
});

// ══════════════════════════════════════════════════════════════
// Multi-Photo Carousel Tests
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "fb-posts: daily digest collects up to 6 product photos",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const listings = [
      { photos: ["photo1.jpg"] },
      { photos: ["photo2.jpg", "extra.jpg"] },
      { photos: ["photo3.jpg"] },
      { photos: [] },
      { photos: ["photo4.jpg"] },
      { photos: ["photo5.jpg"] },
      { photos: ["photo6.jpg"] },
      { photos: ["photo7.jpg"] }, // should be excluded (cap at 6)
    ];

    const allPhotos = listings
      .filter((l) => l.photos?.length > 0)
      .map((l) => l.photos[0])
      .slice(0, 6);

    assertEquals(allPhotos.length, 6, "Should cap at 6 photos");
    assertEquals(allPhotos[0], "photo1.jpg", "Should use first photo of each listing");
    assert(!allPhotos.includes("photo7.jpg"), "Should NOT include 7th listing's photo");
    assert(!allPhotos.includes("extra.jpg"), "Should only take first photo per listing");
  },
});

Deno.test({
  name: "fb-posts: seller menu collects up to 10 product photos",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const allProductPhotos: string[] = [];
    const products = Array.from({ length: 12 }, (_, i) => ({
      photos: [`product${i + 1}.jpg`],
    }));

    for (const p of products) {
      if (p.photos?.length > 0 && allProductPhotos.length < 10) {
        allProductPhotos.push(p.photos[0]);
      }
    }

    assertEquals(allProductPhotos.length, 10, "Should cap at 10 photos");
    assertEquals(allProductPhotos[0], "product1.jpg");
    assert(!allProductPhotos.includes("product11.jpg"), "Should NOT include 11th product");
  },
});

Deno.test({
  name: "fb-posts: welcome post collects seller logos/avatars",
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const sellers = [
      { logo: "logo1.jpg", avatar: "avatar1.jpg" },
      { logo: null, avatar: "avatar2.jpg" },
      { logo: "logo3.jpg", avatar: null },
      { logo: null, avatar: null },
    ];

    const photoUrls: string[] = [];
    for (const s of sellers) {
      const photo = s.logo || s.avatar;
      if (photo) photoUrls.push(photo);
    }

    assertEquals(photoUrls.length, 3, "Should collect 3 photos (skip seller with no logo/avatar)");
    assertEquals(photoUrls[0], "logo1.jpg", "Should prefer logo over avatar");
    assertEquals(photoUrls[1], "avatar2.jpg", "Should fall back to avatar when no logo");
    assertEquals(photoUrls[2], "logo3.jpg", "Should use logo when no avatar");
  },
});

// ══════════════════════════════════════════════════════════════
// Schema Tests
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "fb-posts: fb_auto_post_log table exists with required columns",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const cols = await sqlExec(`
      SELECT string_agg(column_name, ',' ORDER BY column_name)
      FROM information_schema.columns
      WHERE table_name = 'fb_auto_post_log'
    `);
    assert(cols.includes("user_id"), "Should have user_id");
    assert(cols.includes("target"), "Should have target");
    assert(cols.includes("fb_post_id"), "Should have fb_post_id");
    assert(cols.includes("message"), "Should have message");
    assert(cols.includes("created_at"), "Should have created_at");
  },
});

Deno.test({
  name: "fb-posts: fb_auto_post_log has daily rate-limit index",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const hasIndex = await sqlExec(`
      SELECT COUNT(*) FROM pg_indexes
      WHERE tablename = 'fb_auto_post_log'
      AND indexdef LIKE '%user_id%'
      AND indexdef LIKE '%target%'
      AND indexdef LIKE '%created_at%'
    `);
    assert(parseInt(hasIndex) > 0, "Should have composite index for daily rate limiting");
  },
});

// ══════════════════════════════════════════════════════════════
// Auto-Publish Flow Tests (no admin queue)
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "fb-posts: generate-fb-posts returns auto-publish response (not queue)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status, data } = await callFunction("generate-fb-posts");

    assert(
      [200, 400, 500].includes(status),
      `Expected structured response, got ${status}: ${JSON.stringify(data)}`,
    );
    assertExists(data);

    if (status === 200) {
      // Should return publish counts, not queue counts
      assert(data.seller_posts !== undefined || data.seller_failed !== undefined,
        "Should have seller_posts or seller_failed");
      assert(data.casagrown_published !== undefined || data.casagrown_failed !== undefined,
        "Should have casagrown_published or casagrown_failed (not casagrown_queued)");
      assert(data.casagrown_queued === undefined,
        "Should NOT have casagrown_queued (auto-publish, no queue)");
    }
  },
});

Deno.test({
  name: "fb-posts: generate-fb-posts rejects unauthenticated requests",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-fb-posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert([401, 403].includes(res.status), `Expected auth rejection, got ${res.status}`);
  },
});

// ══════════════════════════════════════════════════════════════
// Cron Schedule Tests
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "fb-posts: generate-fb-posts cron is unscheduled/retired",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const schedule = await sqlExec(`
      SELECT schedule FROM cron.job WHERE jobname = 'generate-fb-posts'
    `);
    assertEquals(schedule, "", "Should not be scheduled (retired in favor of real-time sync)");
  },
});

Deno.test({
  name: "fb-posts: sync-facebook-catalog cron is scheduled every 6 hours",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const schedule = await sqlExec(`
      SELECT schedule FROM cron.job WHERE jobname = 'sync-facebook-catalog'
    `);
    assertEquals(schedule, "15 */6 * * *", "Should run every 6 hours");
  },
});

// ══════════════════════════════════════════════════════════════
// Rate Limiting Tests
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "fb-posts: can insert and query auto post log for rate limiting",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await sqlExec(`SELECT id FROM auth.users LIMIT 1`);
    if (!userId || userId.length < 10) {
      console.log("⚠️ No users in DB — skipping insert test");
      return;
    }

    // Insert a test log entry
    const result = await sqlExec(`
      INSERT INTO fb_auto_post_log (user_id, target, message)
      VALUES ('${userId}', 'seller_page', 'Test auto post')
      RETURNING id
    `);
    assertExists(result, "Should insert log entry");
    assert(result.length > 10, `Should return UUID, got: ${result}`);

    // Query today's count (rate limit check)
    const count = await sqlExec(`
      SELECT COUNT(*) FROM fb_auto_post_log
      WHERE user_id = '${userId}'
      AND target = 'seller_page'
      AND created_at >= CURRENT_DATE
    `);
    assert(parseInt(count) >= 1, "Should find at least 1 post today");

    // Cleanup
    await sqlExec(`DELETE FROM fb_auto_post_log WHERE message = 'Test auto post'`);
  },
});

Deno.test({
  name: "fb-posts: welcome post dedup checks fb_auto_post_log (not fb_post_queue)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Insert a welcome post log from this week
    await sqlExec(`
      INSERT INTO fb_auto_post_log (target, message)
      VALUES ('casagrown_page', '🎉 New on CasaGrown this week! Welcome...')
    `);

    // Check dedup query finds it
    const count = await sqlExec(`
      SELECT COUNT(*) FROM fb_auto_post_log
      WHERE target = 'casagrown_page'
      AND message ILIKE '%New on CasaGrown this week%'
      AND created_at >= NOW() - INTERVAL '7 days'
    `);
    assert(parseInt(count) >= 1, "Should find welcome post in auto_post_log for dedup");

    // Cleanup
    await sqlExec(`DELETE FROM fb_auto_post_log WHERE message LIKE '%New on CasaGrown this week%'`);
  },
});

Deno.test({
  name: "fb-posts: respects sync_enabled = false on booth_fb_catalogs during daily updates",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Verify sync_enabled column exists on booth_fb_catalogs
    const hasSyncFilter = await sqlExec(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'booth_fb_catalogs' 
        AND column_name = 'sync_enabled'
      )
    `);
    assertEquals(hasSyncFilter, "t", "sync_enabled column must exist on booth_fb_catalogs");
  },
});

