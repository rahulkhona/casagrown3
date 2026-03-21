/**
 * batch-paypal-payout.ts — Shared helper for batched PayPal Payouts
 *
 * PayPal Payouts API supports up to 15,000 items per batch call.
 * This helper:
 *   1. Collects all recipients into a single batch
 *   2. Sends one POST /v1/payments/payouts call
 *   3. Returns the batch ID for status tracking
 */

export interface PayPalRecipient {
  user_id: string;
  payout_handle: string; // PayPal email or Venmo phone
  amount_usd: number;
  note?: string;
}

export interface PayPalBatchResult {
  success: boolean;
  batch_id?: string;
  error?: string;
  items_count: number;
}

/**
 * Get PayPal OAuth2 token
 */
async function getPayPalToken(
  clientId: string,
  secret: string,
  baseUrl: string
): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Send a batch PayPal Payout — single API call for up to 15,000 recipients
 */
export async function sendBatchPayPalPayout(
  recipients: PayPalRecipient[],
  clientId: string,
  secret: string,
  baseUrl: string,
  batchLabel: string = "auto-payout"
): Promise<PayPalBatchResult> {
  if (recipients.length === 0) {
    return { success: true, items_count: 0 };
  }

  if (recipients.length > 15000) {
    throw new Error(
      `PayPal batch limit is 15,000 items. Got ${recipients.length}`
    );
  }

  const token = await getPayPalToken(clientId, secret, baseUrl);
  const batchId = `${batchLabel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const payload = {
    sender_batch_header: {
      sender_batch_id: batchId,
      email_subject: "You have a payment from CasaGrown",
      email_message:
        "Your CasaGrown market earnings have been sent to your account.",
    },
    items: recipients.map((r, idx) => ({
      recipient_type: r.payout_handle.includes("@") ? "EMAIL" : "PHONE",
      amount: {
        value: r.amount_usd.toFixed(2),
        currency: "USD",
      },
      receiver: r.payout_handle,
      note: r.note || "CasaGrown market earnings payout",
      sender_item_id: `${batchId}-${idx}-${r.user_id.substring(0, 8)}`,
    })),
  };

  const res = await fetch(`${baseUrl}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("[BATCH-PAYPAL] API error:", res.status, errBody);
    return {
      success: false,
      error: `PayPal API ${res.status}: ${errBody}`,
      items_count: recipients.length,
    };
  }

  const data = await res.json();
  const payoutBatchId =
    data.batch_header?.payout_batch_id || data.payout_batch_id;

  console.log(
    `[BATCH-PAYPAL] Submitted batch ${payoutBatchId} with ${recipients.length} items`
  );

  return {
    success: true,
    batch_id: payoutBatchId,
    items_count: recipients.length,
  };
}

/**
 * Run async tasks with concurrency limit
 */
export async function pAll<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  { concurrency = 10 }: { concurrency?: number } = {}
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = fn(item).then((r) => {
      results.push(r);
    });
    executing.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove settled promises
      for (let i = executing.length - 1; i >= 0; i--) {
        // Check if resolved by trying to race with instant resolve
        const settled = await Promise.race([
          executing[i].then(() => true),
          Promise.resolve(false),
        ]);
        if (settled) executing.splice(i, 1);
      }
    }
  }

  await Promise.all(executing);
  return results;
}
