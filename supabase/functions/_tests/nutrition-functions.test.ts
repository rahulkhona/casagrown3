import { assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.test("Nutrition Estimator - Per-Item Caching Flow", async () => {
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const uniqueId = Date.now();
  const email1 = `cache1_${uniqueId}@test.local`;
  const email2 = `cache2_${uniqueId}@test.local`;
  const email3 = `cache3_${uniqueId}@test.local`;

  // 1. Clear out any existing cache for our test items
  await adminClient.from("nutrition_item_cache").delete().in("name", ["strawberry", "blueberry", "raspberry"]);

  // Define our payload
  const payload1 = {
    produce: ["Strawberries", "Blueberries"],
    lead: {
      name: "Cache Tester 1",
      email: email1,
      phone: "5550001234"
    }
  };

  // 2. First Invocation: Cache Miss (Both items should be generated)
  const res1 = await fetch(`${SUPABASE_URL}/functions/v1/estimate-nutrition-loss`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(payload1)
  });

  const data1 = await res1.json();
  const result1 = data1.ai_nutrition_result;
  
  assertExists(result1, "First invocation should return a result");
  console.log("RESULT1:", result1); assertEquals(result1.items.length, 2, "First invocation should return 2 items");
  
  // Verify items were actually saved to the cache
  const { data: cacheCheck1 } = await adminClient.from("nutrition_item_cache").select("*").in("name", ["strawberry", "blueberry"]);
  assertEquals(cacheCheck1?.length, 2, "Both items should have been saved to the cache table");

  // 3. Second Invocation: Partial Cache Hit (1 cached, 1 new)
  const payload2 = {
    produce: ["Strawberry", "Raspberries"], // Strawberry is cached, Raspberry is new
    lead: {
      name: "Cache Tester 2",
      email: email2
    }
  };

  const res2 = await fetch(`${SUPABASE_URL}/functions/v1/estimate-nutrition-loss`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(payload2)
  });

  const data2 = await res2.json();
  console.log("DATA2:", data2);
  const result2 = data2.ai_nutrition_result;
  
  assertExists(result2, "Second invocation should return a result");
  assertEquals(result2.items.length, 2, "Second invocation should return 2 merged items (1 from cache, 1 from AI)");
  
  const appleItem = result2.items.find((i: any) => i.name === "strawberry");
  const cherryItem = result2.items.find((i: any) => i.name === "raspberry");
  assertExists(appleItem, "Should contain strawberry");
  assertExists(cherryItem, "Should contain raspberry");

  // Verify the new item was added to the cache
  const { data: cacheCheck2 } = await adminClient.from("nutrition_item_cache").select("*").in("name", ["strawberry", "blueberry", "raspberry"]);
  assertEquals(cacheCheck2?.length, 3, "Raspberry should have been added, making 3 items total in cache");

  // 4. Third Invocation: 100% Cache Hit
  const payload3 = {
    produce: ["Blueberry", "Raspberry"], // Both are cached
    lead: {
      name: "Cache Tester 3",
      email: email3
    }
  };

  const startTime = Date.now();
  const res3 = await fetch(`${SUPABASE_URL}/functions/v1/estimate-nutrition-loss`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(payload3)
  });
  const data3 = await res3.json();
  const duration = Date.now() - startTime;

  assertExists(data3.ai_nutrition_result, "Third invocation should return a result");
  assertEquals(data3.ai_nutrition_result.items.length, 2, "Third invocation should return 2 items from cache");
  // A 100% cache hit should be lightning fast, well under 2 seconds (unlike an LLM call which takes 3-10s)
  assertEquals(duration < 2000, true, "100% cache hit should resolve instantly without hitting LLM");
});
