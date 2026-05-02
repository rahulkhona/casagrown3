const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID") || "test";
const PAYPAL_SECRET = Deno.env.get("PAYPAL_SECRET") || "test";
const PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";

const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
console.log("Starting fetch...");
try {
  const authRes = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: "POST", 
      headers: { "Authorization": `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, 
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(5000)
  });
  console.log("Status:", authRes.status);
  console.log("Body:", await authRes.text());
} catch (e) {
  console.error("Fetch failed:", e);
}
