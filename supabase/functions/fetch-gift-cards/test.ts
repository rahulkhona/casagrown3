// deno-lint-ignore no-import-prefix
import { assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Simple compiled smoke test
Deno.test("fetch-gift-cards Edge Function exists and imports", async () => {
    // We can't easily integration-test external Tremendous/Reloadly APIs here,
    // but we can ensure the file resolves and TypeScript compiles.
    const mod = await import("./index.ts");
    assertExists(mod);
});
