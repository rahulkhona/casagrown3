/**
 * Start the Stripe simulator on port 8089 for local development.
 * 
 * Usage: deno run --allow-net supabase/functions/_tests/start-stripe-sim.ts
 */
import { StripeSimulator } from "./stripe-simulator.ts";

const sim = new StripeSimulator(8089);
sim.addDefaultTransferBehavior("success");
await sim.start();
console.log("🟢 Stripe simulator running on http://127.0.0.1:8089");
console.log("   Supports: customers, checkout/sessions, subscriptions, billing_portal, payment_intents, transfers, refunds, accounts");
console.log("   Press Ctrl+C to stop");

// Keep alive
await new Promise(() => {});
