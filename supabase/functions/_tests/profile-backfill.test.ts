/**
 * Unit & Integration Test: Contextual Address & Phone Profile Backfill
 * Verifies that Stripe checkout & subscription details backfill missing
 * profile address/phone fields onto the profiles table.
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { backfillProfileFromStripeDetails } from "../_shared/profile-backfill.ts";

Deno.test("Contextual Profile Backfill logic test", async () => {
  // Mock Supabase client with state
  let profileState: any = {
    id: "test-user-id",
    street_address: null,
    city: null,
    state_code: null,
    zip_code: null,
    country_code: null,
    phone_number: null,
  };

  const supabaseMock = {
    from(table: string) {
      return {
        select(cols: string) {
          return {
            eq(col: string, val: string) {
              return {
                async single() {
                  return { data: profileState, error: null };
                },
              };
            },
          };
        },
        update(updates: any) {
          return {
            async eq(col: string, val: string) {
              profileState = { ...profileState, ...updates };
              return { data: profileState, error: null };
            },
          };
        },
      };
    },
  };

  const stripeDetails = {
    address: {
      line1: "742 Evergreen Terrace",
      city: "Springfield",
      state: "OR",
      postal_code: "97477",
      country: "US",
    },
    phone: "+15551234567",
  };

  const result = await backfillProfileFromStripeDetails(supabaseMock, "test-user-id", stripeDetails);
  assertExists(result);

  assertEquals(profileState.street_address, "742 Evergreen Terrace");
  assertEquals(profileState.city, "Springfield");
  assertEquals(profileState.state_code, "OR");
  assertEquals(profileState.zip_code, "97477");
  assertEquals(profileState.phone_number, "+15551234567");

  // Re-run should not overwrite existing values
  const secondResult = await backfillProfileFromStripeDetails(supabaseMock, "test-user-id", {
    address: { line1: "123 New St", city: "NewCity", state: "CA", postal_code: "90210" },
    phone: "+19999999999",
  });
  assertEquals(secondResult, null);
});
