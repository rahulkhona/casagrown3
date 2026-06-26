import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { evaluateRule, evaluateQuery } from "../_shared/evaluate.ts";

// ===== evaluateRule tests =====

Deno.test("evaluateRule — boolean true (string)", () => {
  assertEquals(evaluateRule({ field: "has_email", operator: "=", value: "true" }, { has_email: true }), true);
  assertEquals(evaluateRule({ field: "has_email", operator: "=", value: "true" }, { has_email: false }), false);
  assertEquals(evaluateRule({ field: "has_email", operator: "=", value: "true" }, { has_email: "true" }), true);
});

Deno.test("evaluateRule — boolean false (string)", () => {
  assertEquals(evaluateRule({ field: "has_phone", operator: "=", value: "false" }, { has_phone: false }), true);
  assertEquals(evaluateRule({ field: "has_phone", operator: "=", value: "false" }, { has_phone: true }), false);
  assertEquals(evaluateRule({ field: "has_phone", operator: "=", value: "false" }, { has_phone: "false" }), true);
});

Deno.test("evaluateRule — boolean true (native)", () => {
  assertEquals(evaluateRule({ field: "active", operator: "=", value: true }, { active: true }), true);
  assertEquals(evaluateRule({ field: "active", operator: "=", value: true }, { active: false }), false);
});

Deno.test("evaluateRule — boolean false (native)", () => {
  assertEquals(evaluateRule({ field: "active", operator: "=", value: false }, { active: false }), true);
  assertEquals(evaluateRule({ field: "active", operator: "=", value: false }, { active: true }), false);
});

Deno.test("evaluateRule — equality (=)", () => {
  assertEquals(evaluateRule({ field: "status", operator: "=", value: "new" }, { status: "new" }), true);
  assertEquals(evaluateRule({ field: "status", operator: "=", value: "new" }, { status: "old" }), false);
});

Deno.test("evaluateRule — inequality (!=)", () => {
  assertEquals(evaluateRule({ field: "status", operator: "!=", value: "new" }, { status: "old" }), true);
  assertEquals(evaluateRule({ field: "status", operator: "!=", value: "new" }, { status: "new" }), false);
});

Deno.test("evaluateRule — numeric comparisons", () => {
  assertEquals(evaluateRule({ field: "days", operator: ">", value: "5" }, { days: 10 }), true);
  assertEquals(evaluateRule({ field: "days", operator: ">", value: "5" }, { days: 3 }), false);
  assertEquals(evaluateRule({ field: "days", operator: "<", value: "5" }, { days: 3 }), true);
  assertEquals(evaluateRule({ field: "days", operator: ">=", value: "5" }, { days: 5 }), true);
  assertEquals(evaluateRule({ field: "days", operator: "<=", value: "5" }, { days: 5 }), true);
  assertEquals(evaluateRule({ field: "days", operator: "<=", value: "5" }, { days: 6 }), false);
});

Deno.test("evaluateRule — contains (string)", () => {
  assertEquals(evaluateRule({ field: "name", operator: "contains", value: "casa" }, { name: "CasaGrown" }), true);
  assertEquals(evaluateRule({ field: "name", operator: "contains", value: "xyz" }, { name: "CasaGrown" }), false);
});

Deno.test("evaluateRule — contains (array)", () => {
  assertEquals(evaluateRule({ field: "tags", operator: "contains", value: "vip" }, { tags: ["vip", "seller"] }), true);
  assertEquals(evaluateRule({ field: "tags", operator: "contains", value: "buyer" }, { tags: ["vip", "seller"] }), false);
});

Deno.test("evaluateRule — doesNotContain", () => {
  assertEquals(evaluateRule({ field: "name", operator: "doesNotContain", value: "xyz" }, { name: "CasaGrown" }), true);
  assertEquals(evaluateRule({ field: "name", operator: "doesNotContain", value: "casa" }, { name: "CasaGrown" }), false);
  assertEquals(evaluateRule({ field: "tags", operator: "doesNotContain", value: "buyer" }, { tags: ["vip"] }), true);
  assertEquals(evaluateRule({ field: "tags", operator: "doesNotContain", value: "vip" }, { tags: ["vip"] }), false);
});

Deno.test("evaluateRule — beginsWith", () => {
  assertEquals(evaluateRule({ field: "email", operator: "beginsWith", value: "admin" }, { email: "admin@casagrown.com" }), true);
  assertEquals(evaluateRule({ field: "email", operator: "beginsWith", value: "user" }, { email: "admin@casagrown.com" }), false);
});

Deno.test("evaluateRule — endsWith", () => {
  assertEquals(evaluateRule({ field: "email", operator: "endsWith", value: "casagrown.com" }, { email: "admin@casagrown.com" }), true);
  assertEquals(evaluateRule({ field: "email", operator: "endsWith", value: "gmail.com" }, { email: "admin@casagrown.com" }), false);
});

Deno.test("evaluateRule — null operator", () => {
  assertEquals(evaluateRule({ field: "phone", operator: "null", value: "" }, { phone: null }), true);
  assertEquals(evaluateRule({ field: "phone", operator: "null", value: "" }, { phone: undefined }), true);
  assertEquals(evaluateRule({ field: "phone", operator: "null", value: "" }, { phone: "123" }), false);
  // field not present in data
  assertEquals(evaluateRule({ field: "missing_field", operator: "null", value: "" }, {}), true);
});

Deno.test("evaluateRule — notNull operator", () => {
  assertEquals(evaluateRule({ field: "phone", operator: "notNull", value: "" }, { phone: "123" }), true);
  assertEquals(evaluateRule({ field: "phone", operator: "notNull", value: "" }, { phone: null }), false);
  assertEquals(evaluateRule({ field: "phone", operator: "notNull", value: "" }, { phone: undefined }), false);
});

Deno.test("evaluateRule — unknown operator returns false", () => {
  assertEquals(evaluateRule({ field: "x", operator: "BOGUS", value: "y" }, { x: "y" }), false);
});

Deno.test("evaluateRule — nested query (combinator in rule)", () => {
  const nestedRule = {
    combinator: "and",
    rules: [
      { field: "a", operator: "=", value: "true" },
      { field: "b", operator: "=", value: "true" },
    ],
  };
  assertEquals(evaluateRule(nestedRule, { a: true, b: true }), true);
  assertEquals(evaluateRule(nestedRule, { a: true, b: false }), false);
});

// ===== evaluateQuery tests =====

Deno.test("evaluateQuery — empty/null query returns true", () => {
  assertEquals(evaluateQuery(null, {}), true);
  assertEquals(evaluateQuery(undefined, {}), true);
  assertEquals(evaluateQuery({}, {}), true);
  assertEquals(evaluateQuery({ rules: [] }, {}), true);
  assertEquals(evaluateQuery({ combinator: "and", rules: [] }, {}), true);
});

Deno.test("evaluateQuery — AND combinator (all must match)", () => {
  const query = {
    combinator: "and",
    rules: [
      { field: "has_email", operator: "=", value: "true" },
      { field: "has_phone", operator: "=", value: "true" },
    ],
  };
  assertEquals(evaluateQuery(query, { has_email: true, has_phone: true }), true);
  assertEquals(evaluateQuery(query, { has_email: true, has_phone: false }), false);
  assertEquals(evaluateQuery(query, { has_email: false, has_phone: true }), false);
});

Deno.test("evaluateQuery — OR combinator (any must match)", () => {
  const query = {
    combinator: "or",
    rules: [
      { field: "has_email", operator: "=", value: "true" },
      { field: "has_phone", operator: "=", value: "true" },
    ],
  };
  assertEquals(evaluateQuery(query, { has_email: true, has_phone: false }), true);
  assertEquals(evaluateQuery(query, { has_email: false, has_phone: true }), true);
  assertEquals(evaluateQuery(query, { has_email: false, has_phone: false }), false);
});

Deno.test("evaluateQuery — nested groups", () => {
  // (has_email AND has_phone) OR (has_only_email)
  const query = {
    combinator: "or",
    rules: [
      {
        combinator: "and",
        rules: [
          { field: "has_email", operator: "=", value: "true" },
          { field: "has_phone", operator: "=", value: "true" },
        ],
      },
      { field: "has_only_email", operator: "=", value: "true" },
    ],
  };
  // Both email+phone → true (first group)
  assertEquals(evaluateQuery(query, { has_email: true, has_phone: true, has_only_email: false }), true);
  // Only email → true (second rule)
  assertEquals(evaluateQuery(query, { has_email: true, has_phone: false, has_only_email: true }), true);
  // Neither → false
  assertEquals(evaluateQuery(query, { has_email: false, has_phone: false, has_only_email: false }), false);
});

// ===== Real-world drip sequence conditions =====

Deno.test("real condition — has_only_email = false (not only email)", () => {
  // This is the actual condition from the onboarding drip
  const query = {
    combinator: "and",
    rules: [{ field: "has_only_email", operator: "=", value: "false" }],
  };
  // Lead with both → has_only_email is false → TRUE
  assertEquals(evaluateQuery(query, { has_only_email: false }), true);
  // Lead with only email → has_only_email is true → FALSE
  assertEquals(evaluateQuery(query, { has_only_email: true }), false);
});

Deno.test("real condition — has_created_listings = true", () => {
  const query = {
    combinator: "and",
    rules: [{ field: "has_created_listings", operator: "=", value: "true" }],
  };
  assertEquals(evaluateQuery(query, { has_created_listings: true }), true);
  assertEquals(evaluateQuery(query, { has_created_listings: false }), false);
});

Deno.test("real condition — no contact info (all false)", () => {
  const query = {
    combinator: "and",
    rules: [
      { field: "has_both_email_and_phone", operator: "=", value: "false" },
      { field: "has_only_phone", operator: "=", value: "false" },
      { field: "has_only_email", operator: "=", value: "false" },
    ],
  };
  // No contact info → all false → TRUE
  assertEquals(evaluateQuery(query, { has_both_email_and_phone: false, has_only_phone: false, has_only_email: false }), true);
  // Has email → has_only_email is true → FALSE
  assertEquals(evaluateQuery(query, { has_both_email_and_phone: false, has_only_phone: false, has_only_email: true }), false);
});

Deno.test("real condition — days_since_last_active > 30", () => {
  const query = {
    combinator: "and",
    rules: [{ field: "days_since_last_active", operator: ">", value: "30" }],
  };
  assertEquals(evaluateQuery(query, { days_since_last_active: 45 }), true);
  assertEquals(evaluateQuery(query, { days_since_last_active: 10 }), false);
  assertEquals(evaluateQuery(query, { days_since_last_active: 30 }), false);
});

Deno.test("real condition — has_phone = true (simple check)", () => {
  const query = {
    combinator: "and",
    rules: [{ field: "has_phone", operator: "=", value: "true" }],
  };
  assertEquals(evaluateQuery(query, { has_phone: true }), true);
  assertEquals(evaluateQuery(query, { has_phone: false }), false);
});

Deno.test("real condition — has_email = true (simple check)", () => {
  const query = {
    combinator: "and",
    rules: [{ field: "has_email", operator: "=", value: "true" }],
  };
  assertEquals(evaluateQuery(query, { has_email: true }), true);
  assertEquals(evaluateQuery(query, { has_email: false }), false);
});
