// Stripe API Simulator — Full Local HTTP Server
//
// Simulates the complete Stripe API surface used by CasaGrown edge functions:
//   - POST   /v1/payment_intents          (create PI)
//   - POST   /v1/payment_intents/:id/capture (capture PI)
//   - POST   /v1/payment_intents/:id/cancel  (cancel PI)
//   - GET    /v1/payment_intents/:id       (retrieve PI)
//   - POST   /v1/transfers                 (Stripe Connect transfer)
//   - POST   /v1/refunds                   (create refund)
//   - GET    /v1/balance_transactions      (list balance transactions)
//   - POST   /v1/accounts                  (create Connect account)
//   - POST   /v1/account_links             (create onboarding link)
//   - GET    /v1/accounts/:id              (retrieve account)
//   - POST   /v1/disputes/:id              (update dispute)
//
// Features:
//   - Configurable per-destination transfer behavior (success/fail/transient/timeout)
//   - Idempotency key enforcement on transfers
//   - In-memory PI state machine (requires_payment_method → requires_capture → succeeded)
//   - Full audit log of every API call
//
// Usage:
//   const sim = new StripeSimulator(8089);
//   sim.addTransferBehavior("acct_xyz", "success");
//   await sim.start();
//   // ... run tests against STRIPE_API_BASE=http://127.0.0.1:8089
//   sim.stop();

export type TransferBehavior =
  | "success"
  | "permanent_failure"
  | "transient_then_success"
  | "timeout";

interface TransferBehaviorConfig {
  behavior: TransferBehavior;
  errorMessage?: string;
  attemptCount: number;
}

interface StoredPI {
  id: string;
  amount: number;
  currency: string;
  status: string;
  capture_method: string;
  client_secret: string;
  latest_charge: string | null;
  metadata: Record<string, string>;
  description: string;
  payment_method: string | null;
  created: number;
}

interface StoredAccount {
  id: string;
  type: string;
  country: string;
  email: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  created: number;
}

export interface ApiCallLog {
  method: string;
  path: string;
  status: number;
  timestamp: number;
  body?: Record<string, string>;
}

export class StripeSimulator {
  private port: number;
  private server: Deno.HttpServer | null = null;

  // Transfer behaviors
  private transferBehaviors: Map<string, TransferBehaviorConfig> = new Map();
  private idempotencyCache: Map<string, { status: number; body: unknown }> = new Map();

  // In-memory stores
  private paymentIntents: Map<string, StoredPI> = new Map();
  private accounts: Map<string, StoredAccount> = new Map();
  private refunds: Array<{ id: string; payment_intent: string; amount: number; status: string }> = [];

  // Audit log
  private callLog: ApiCallLog[] = [];

  // Counters for unique IDs
  private counter = 0;

  constructor(port = 8089) {
    this.port = port;
  }

  // ── Transfer behaviors ────────────────────────────────────────────
  addTransferBehavior(destination: string, behavior: TransferBehavior, errorMessage = "Simulated failure") {
    this.transferBehaviors.set(destination, { behavior, errorMessage, attemptCount: 0 });
  }
  addDefaultTransferBehavior(behavior: TransferBehavior, errorMessage = "Simulated failure") {
    this.transferBehaviors.set("__default__", { behavior, errorMessage, attemptCount: 0 });
  }

  // ── Pre-seed data ─────────────────────────────────────────────────
  /** Pre-seed a Connect account so GET /v1/accounts/:id returns it. */
  seedAccount(id: string, overrides: Partial<StoredAccount> = {}) {
    this.accounts.set(id, {
      id,
      type: "express",
      country: "US",
      email: "seller@test.local",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      created: Math.floor(Date.now() / 1000),
      ...overrides,
    });
  }

  // ── Accessors ─────────────────────────────────────────────────────
  getCallLog() { return [...this.callLog]; }
  getTransferLog() { return this.callLog.filter(c => c.path === "/v1/transfers"); }
  getCaptureLog() { return this.callLog.filter(c => c.path.endsWith("/capture")); }
  getPaymentIntent(id: string) { return this.paymentIntents.get(id); }

  // ── Server lifecycle ──────────────────────────────────────────────
  async start() {
    this.server = Deno.serve(
      { port: this.port, hostname: "127.0.0.1" },
      (req) => this.route(req),
    );
    await new Promise((r) => setTimeout(r, 100));
  }

  stop() {
    if (this.server) {
      this.server.shutdown();
      this.server = null;
    }
  }

  reset() {
    this.paymentIntents.clear();
    this.accounts.clear();
    this.refunds = [];
    this.callLog = [];
    this.idempotencyCache.clear();
    this.transferBehaviors.clear();
    this.counter = 0;
  }

  // ── Router ────────────────────────────────────────────────────────
  private async route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Parse body for POST requests
    let params: URLSearchParams | null = null;
    if (method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("form-urlencoded")) {
        params = new URLSearchParams(await req.text());
      } else if (contentType.includes("json")) {
        try {
          const json = await req.json();
          params = new URLSearchParams();
          for (const [k, v] of Object.entries(json)) {
            params.set(k, String(v));
          }
        } catch {
          params = new URLSearchParams();
        }
      } else {
        // Try form-urlencoded by default
        try {
          params = new URLSearchParams(await req.text());
        } catch {
          params = new URLSearchParams();
        }
      }
    }

    // ── Payment Intents ───────────────────────────────────────────
    if (path === "/v1/payment_intents" && method === "POST") {
      return this.handleCreatePI(params!);
    }
    const piCaptureMatch = path.match(/^\/v1\/payment_intents\/([^/]+)\/capture$/);
    if (piCaptureMatch && method === "POST") {
      return this.handleCapturePI(piCaptureMatch[1]!, params);
    }
    const piCancelMatch = path.match(/^\/v1\/payment_intents\/([^/]+)\/cancel$/);
    if (piCancelMatch && method === "POST") {
      return this.handleCancelPI(piCancelMatch[1]!);
    }
    const piGetMatch = path.match(/^\/v1\/payment_intents\/([^/?]+)/);
    if (piGetMatch && method === "GET") {
      return this.handleGetPI(piGetMatch[1]!);
    }

    // ── Transfers ─────────────────────────────────────────────────
    if (path === "/v1/transfers" && method === "POST") {
      return this.handleTransfer(req, params!);
    }

    // ── Refunds ───────────────────────────────────────────────────
    if (path === "/v1/refunds" && method === "POST") {
      return this.handleRefund(params!);
    }

    // ── Balance Transactions ──────────────────────────────────────
    if (path === "/v1/balance_transactions" && method === "GET") {
      return this.handleBalanceTransactions(url.searchParams);
    }

    // ── Connect Accounts ──────────────────────────────────────────
    if (path === "/v1/accounts" && method === "POST") {
      return this.handleCreateAccount(params!);
    }
    if (path === "/v1/account_links" && method === "POST") {
      return this.handleCreateAccountLink(params!);
    }
    const acctGetMatch = path.match(/^\/v1\/accounts\/([^/]+)$/);
    if (acctGetMatch && method === "GET") {
      return this.handleGetAccount(acctGetMatch[1]!);
    }

    // ── Disputes ──────────────────────────────────────────────────
    const disputeMatch = path.match(/^\/v1\/disputes\/([^/]+)$/);
    if (disputeMatch && method === "POST") {
      return this.handleUpdateDispute(disputeMatch[1]!, params!);
    }

    // ── Customers ─────────────────────────────────────────────────
    if (path === "/v1/customers" && method === "POST") {
      return this.handleCreateCustomer(params!);
    }

    // ── Checkout Sessions ────────────────────────────────────────
    if (path === "/v1/checkout/sessions" && method === "POST") {
      return this.handleCreateCheckoutSession(params!);
    }

    // ── Subscriptions ────────────────────────────────────────────
    const subMatch = path.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (subMatch && method === "POST") {
      return this.handleUpdateSubscription(subMatch[1]!, params!);
    }

    // ── Billing Portal ───────────────────────────────────────────
    if (path === "/v1/billing_portal/sessions" && method === "POST") {
      return this.handleCreatePortalSession(params!);
    }

    // ── 404 ───────────────────────────────────────────────────────
    this.log("GET", path, 404);
    return this.json(404, { error: { message: `No such endpoint: ${method} ${path}` } });
  }

  // ── Payment Intent handlers ───────────────────────────────────────

  private handleCreatePI(params: URLSearchParams): Response {
    const id = `pi_sim_${++this.counter}_${Date.now()}`;
    const amount = parseInt(params.get("amount") || "0", 10);
    const captureMethod = params.get("capture_method") || "automatic";
    const metadata: Record<string, string> = {};
    for (const [k, v] of params.entries()) {
      if (k.startsWith("metadata[")) {
        const key = k.replace(/^metadata\[/, "").replace(/\]$/, "");
        metadata[key] = v;
      }
    }

    const pi: StoredPI = {
      id,
      amount,
      currency: params.get("currency") || "usd",
      status: "requires_payment_method",
      capture_method: captureMethod,
      client_secret: `${id}_secret_sim`,
      latest_charge: null,
      metadata,
      description: params.get("description") || "",
      payment_method: null,
      created: Math.floor(Date.now() / 1000),
    };
    this.paymentIntents.set(id, pi);
    this.log("POST", "/v1/payment_intents", 200);
    return this.json(200, this.formatPI(pi));
  }

  private handleCapturePI(piId: string, params: URLSearchParams | null): Response {
    const pi = this.paymentIntents.get(piId);
    if (!pi) {
      this.log("POST", `/v1/payment_intents/${piId}/capture`, 404);
      return this.json(404, {
        error: { type: "invalid_request_error", message: `No such payment_intent: '${piId}'` },
      });
    }
    // Allow capture from requires_capture or requires_payment_method (for sim flexibility)
    const chargeId = `ch_sim_${++this.counter}_${Date.now()}`;
    if (params?.get("amount_to_capture")) {
      pi.amount = parseInt(params.get("amount_to_capture")!, 10);
    }
    pi.status = "succeeded";
    pi.latest_charge = chargeId;
    this.log("POST", `/v1/payment_intents/${piId}/capture`, 200);
    return this.json(200, this.formatPI(pi));
  }

  private handleCancelPI(piId: string): Response {
    const pi = this.paymentIntents.get(piId);
    if (!pi) {
      this.log("POST", `/v1/payment_intents/${piId}/cancel`, 404);
      return this.json(404, {
        error: { type: "invalid_request_error", message: `No such payment_intent: '${piId}'` },
      });
    }
    pi.status = "canceled";
    this.log("POST", `/v1/payment_intents/${piId}/cancel`, 200);
    return this.json(200, this.formatPI(pi));
  }

  private handleGetPI(piId: string): Response {
    const pi = this.paymentIntents.get(piId);
    if (!pi) {
      this.log("GET", `/v1/payment_intents/${piId}`, 404);
      return this.json(404, {
        error: { type: "invalid_request_error", message: `No such payment_intent: '${piId}'` },
      });
    }
    this.log("GET", `/v1/payment_intents/${piId}`, 200);
    return this.json(200, this.formatPI(pi));
  }

  private formatPI(pi: StoredPI): Record<string, unknown> {
    return {
      id: pi.id,
      object: "payment_intent",
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
      capture_method: pi.capture_method,
      client_secret: pi.client_secret,
      latest_charge: pi.latest_charge,
      metadata: pi.metadata,
      description: pi.description,
      payment_method: pi.payment_method,
      created: pi.created,
      // For expand[]=payment_method compatibility
      payment_method_options: { card: { last4: "4242" } },
      charges: pi.latest_charge
        ? { data: [{ id: pi.latest_charge, payment_method_details: { card: { last4: "4242" } } }] }
        : { data: [] },
    };
  }

  // ── Transfer handler ──────────────────────────────────────────────

  private handleTransfer(req: Request, params: URLSearchParams): Response {
    const idempotencyKey = req.headers.get("Idempotency-Key") || "";

    // Check idempotency cache
    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      const cached = this.idempotencyCache.get(idempotencyKey)!;
      this.log("POST", "/v1/transfers", cached.status, { idempotency: "cached" });
      return this.json(cached.status, cached.body);
    }

    const destination = params.get("destination") || "";
    const amount = parseInt(params.get("amount") || "0", 10);
    const transferGroup = params.get("transfer_group") || "";
    const userId = params.get("metadata[user_id]") || "";

    // Look up behavior
    const config = this.transferBehaviors.get(destination)
      || this.transferBehaviors.get("__default__")
      || { behavior: "success" as TransferBehavior, errorMessage: "", attemptCount: 0 };

    config.attemptCount++;

    let body: unknown;
    let status: number;

    switch (config.behavior) {
      case "success": {
        const transferId = `tr_sim_${++this.counter}_${Date.now()}`;
        body = {
          id: transferId, object: "transfer", amount, currency: "usd",
          destination, transfer_group: transferGroup,
          metadata: { settlement_id: transferGroup, user_id: userId },
          created: Math.floor(Date.now() / 1000),
        };
        status = 200;
        break;
      }
      case "permanent_failure": {
        body = { error: { type: "invalid_request_error", message: config.errorMessage, code: "account_invalid" } };
        status = 400;
        break;
      }
      case "transient_then_success": {
        if (config.attemptCount <= 1) {
          body = { error: { type: "api_error", message: "Internal server error (simulated transient)" } };
          status = 500;
        } else {
          const transferId = `tr_sim_retry_${++this.counter}_${Date.now()}`;
          body = {
            id: transferId, object: "transfer", amount, currency: "usd",
            destination, transfer_group: transferGroup,
            metadata: { settlement_id: transferGroup, user_id: userId },
            created: Math.floor(Date.now() / 1000),
          };
          status = 200;
        }
        break;
      }
      case "timeout": {
        body = { error: { type: "api_error", message: "Gateway timeout (simulated)" } };
        status = 504;
        break;
      }
      default: {
        body = { error: { message: "Unknown behavior" } };
        status = 500;
      }
    }

    // Cache for idempotency
    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, { status, body });
    }

    this.log("POST", "/v1/transfers", status, { destination, amount: String(amount) });
    return this.json(status, body);
  }

  // ── Refund handler ────────────────────────────────────────────────

  private handleRefund(params: URLSearchParams): Response {
    const paymentIntent = params.get("payment_intent") || params.get("charge") || "";
    const amount = parseInt(params.get("amount") || "0", 10);

    // Check if PI exists
    const pi = this.paymentIntents.get(paymentIntent);
    if (!pi && paymentIntent.startsWith("pi_")) {
      this.log("POST", "/v1/refunds", 400);
      return this.json(400, {
        error: { type: "invalid_request_error", message: `No such payment_intent: '${paymentIntent}'` },
      });
    }

    const refundId = `re_sim_${++this.counter}_${Date.now()}`;
    const refundAmount = amount || pi?.amount || 0;
    const refund = { id: refundId, payment_intent: paymentIntent, amount: refundAmount, status: "succeeded" };
    this.refunds.push(refund);

    this.log("POST", "/v1/refunds", 200);
    return this.json(200, {
      id: refundId,
      object: "refund",
      amount: refundAmount,
      currency: "usd",
      payment_intent: paymentIntent,
      status: "succeeded",
      created: Math.floor(Date.now() / 1000),
    });
  }

  // ── Balance Transactions handler ──────────────────────────────────

  private handleBalanceTransactions(queryParams: URLSearchParams): Response {
    const payoutId = queryParams.get("payout") || "";
    // Return simulated balance transactions matching the payout
    // In production, this is used to reconcile payout → charges → settlements
    const txns: Array<Record<string, unknown>> = [];

    // Generate 1-3 fake balance transactions
    for (let i = 0; i < 2; i++) {
      txns.push({
        id: `txn_sim_${++this.counter}`,
        object: "balance_transaction",
        amount: 5000 + i * 1000,
        currency: "usd",
        type: "charge",
        source: `ch_sim_payout_${this.counter}`,
        description: `Simulated charge for payout ${payoutId}`,
        created: Math.floor(Date.now() / 1000),
      });
    }

    this.log("GET", "/v1/balance_transactions", 200);
    return this.json(200, {
      object: "list",
      data: txns,
      has_more: false,
      url: "/v1/balance_transactions",
    });
  }

  // ── Connect Account handlers ──────────────────────────────────────

  private handleCreateAccount(params: URLSearchParams): Response {
    const id = `acct_sim_${++this.counter}_${Date.now()}`;
    const acct: StoredAccount = {
      id,
      type: params.get("type") || "express",
      country: params.get("country") || "US",
      email: params.get("email") || "seller@test.local",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      created: Math.floor(Date.now() / 1000),
    };
    this.accounts.set(id, acct);

    this.log("POST", "/v1/accounts", 200);
    return this.json(200, { ...acct, object: "account" });
  }

  private handleCreateAccountLink(params: URLSearchParams): Response {
    const accountId = params.get("account") || "";
    const returnUrl = params.get("return_url") || "";
    const refreshUrl = params.get("refresh_url") || "";

    this.log("POST", "/v1/account_links", 200);
    return this.json(200, {
      object: "account_link",
      url: `https://connect.stripe.com/setup/sim/${accountId}?return=${encodeURIComponent(returnUrl)}`,
      created: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
  }

  private handleGetAccount(accountId: string): Response {
    const acct = this.accounts.get(accountId);
    if (!acct) {
      this.log("GET", `/v1/accounts/${accountId}`, 404);
      return this.json(404, {
        error: { type: "invalid_request_error", message: `No such account: '${accountId}'` },
      });
    }
    this.log("GET", `/v1/accounts/${accountId}`, 200);
    return this.json(200, { ...acct, object: "account" });
  }

  // ── Dispute handler ───────────────────────────────────────────────

  private handleUpdateDispute(disputeId: string, _params: URLSearchParams): Response {
    this.log("POST", `/v1/disputes/${disputeId}`, 200);
    return this.json(200, {
      id: disputeId,
      object: "dispute",
      status: "under_review",
      created: Math.floor(Date.now() / 1000),
    });
  }

  // ── Customer handler ──────────────────────────────────────────────

  private handleCreateCustomer(params: URLSearchParams): Response {
    const id = `cus_sim_${++this.counter}_${Date.now()}`;
    this.log("POST", "/v1/customers", 200);
    return this.json(200, {
      id,
      object: "customer",
      email: params.get("email") || "test@test.local",
      metadata: this.parseMetadata(params),
      created: Math.floor(Date.now() / 1000),
    });
  }

  // ── Checkout Session handler ──────────────────────────────────────

  private handleCreateCheckoutSession(params: URLSearchParams): Response {
    const id = `cs_sim_${++this.counter}_${Date.now()}`;
    const successUrl = params.get("success_url") || "http://localhost:3002/profile?pro=success";
    // Simulate: return a URL that redirects to the success page directly
    this.log("POST", "/v1/checkout/sessions", 200);
    return this.json(200, {
      id,
      object: "checkout.session",
      mode: params.get("mode") || "subscription",
      customer: params.get("customer") || null,
      url: successUrl,
      status: "open",
      created: Math.floor(Date.now() / 1000),
    });
  }

  // ── Subscription handler ──────────────────────────────────────────

  private handleUpdateSubscription(subId: string, params: URLSearchParams): Response {
    this.log("POST", `/v1/subscriptions/${subId}`, 200);
    return this.json(200, {
      id: subId,
      object: "subscription",
      status: params.get("cancel_at_period_end") === "true" ? "active" : "active",
      cancel_at_period_end: params.get("cancel_at_period_end") === "true",
      created: Math.floor(Date.now() / 1000),
    });
  }

  // ── Billing Portal handler ────────────────────────────────────────

  private handleCreatePortalSession(params: URLSearchParams): Response {
    const returnUrl = params.get("return_url") || "http://localhost:3002/profile";
    this.log("POST", "/v1/billing_portal/sessions", 200);
    return this.json(200, {
      id: `bps_sim_${++this.counter}`,
      object: "billing_portal.session",
      url: `${returnUrl}?portal=simulated`,
      created: Math.floor(Date.now() / 1000),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private parseMetadata(params: URLSearchParams): Record<string, string> {
    const metadata: Record<string, string> = {};
    for (const [k, v] of params.entries()) {
      if (k.startsWith("metadata[")) {
        const key = k.replace(/^metadata\[/, "").replace(/\]$/, "");
        metadata[key] = v;
      }
    }
    return metadata;
  }

  private log(method: string, path: string, status: number, extra?: Record<string, string>) {
    this.callLog.push({ method, path, status, timestamp: Date.now(), body: extra });
  }

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
