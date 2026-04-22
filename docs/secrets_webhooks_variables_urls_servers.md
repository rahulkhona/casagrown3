# CasaGrown Architecture: Secrets, Variables & Webhooks Setup Guide

This document is the master configuration guide for deploying the full CasaGrown monorepo. It outlines exactly what secrets, environment variables, APIs, and Webhooks must be configured across Vercel (Frontend), Supabase (Backend/Database), and third-party systems.

## 1. Vercel Configuration (Frontend)

These variables must be added to your Vercel Project Settings. They expose public keys and routing configuration to the Next.js `apps/next-market` application.

| Variable Name | Purpose | Example / Where to find |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Connects Next.js to your Supabase instance. | `https://[PROJECT_ID].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key for Supabase Auth and Row Level Security. | Supabase Dashboard -> Project Settings -> API |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Enables Stripe Elements (credit card inputs/Apple Pay). | `pk_test_...` or `pk_live_...` from Stripe Dashboard |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key for browser Push Notifications. | `BNekJ12j-POg5NswygqWO1iCZjKx8ErjnJd35smwv1ST9mKXWV3v-8AgJ96DmD9nbgPbfMHtCeKe6_tjXVtEzCs` |
| `NEXT_PUBLIC_ENABLE_PHONE_VERIFICATION`| Feature flag for Twilio OTP flows. | `true` or `false` |

---

## 2. Supabase Configuration (Backend)

These secrets securely power your Edge Functions. They MUST NOT be exposed to the frontend. Add them using the Supabase CLI (`supabase secrets set KEY="value"`) or the Supabase Cloud Dashboard.

### A. Financial Integrity (Payments, Donations & Cashouts)
| Secret | Purpose | Source |
| :--- | :--- | :--- |
| `STRIPE_SECRET_KEY` | Processes payments and platform fees. | Stripe Dashboard -> API Keys (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Cryptographically verifies incoming Stripe payloads. | Stripe Dashboard -> Webhooks (`whsec_...`) |
| `PAYPAL_CLIENT_ID` | OAuth Client ID for PayPal checkouts (No `test_` or `live_` prefix—verify in dashboard). | PayPal Developer Dashboard |
| `PAYPAL_SECRET` | OAuth Secret for PayPal transactions. | PayPal Developer Dashboard |
| `PAYPAL_BASE_URL` | Routing target (`api-m.paypal.com` vs `api-m.sandbox.paypal.com`). Dictates Sandbox vs Live! | PayPal Developer Dashboard |
| `PAYPAL_ENABLED` | Feature flag to actively show PayPal checkout to users. | `true` or `false` |
| `GLOBALGIVING_API_KEY` | Authenticates donations to agricultural non-profits at checkout.| GlobalGiving API Dashboard |
| `GLOBALGIVING_SANDBOX` | Points GlobalGiving to sandbox vs production. | `true` or `false` |
| `ZIPTAX_API_KEY` | Calculates dynamic interstate sales tax for botanical orders. | ZipTax Dashboard -> API Keys |
| `TREMENDOUS_API_KEY` | Issues digital gift cards/VISA debit for US cashouts. | Tremendous Dashboard |
| `RELOADLY_CLIENT_ID` | OAuth Client ID for Global (Mexico/Canada) cashouts. | Reloadly API Dashboard |
| `RELOADLY_CLIENT_SECRET` | OAuth Secret for Global cashouts. | Reloadly API Dashboard |
| `RELOADLY_SANDBOX` | Points Reloadly to sandbox vs production. | `true` or `false` |

### B. Trust & Safety (Identity & Location)
| Secret | Purpose | Source |
| :--- | :--- | :--- |
| `TWILIO_ACCOUNT_SID` | Core Twilio account credential. | Twilio Console |
| `TWILIO_AUTH_TOKEN` | Twilio authorization token. | Twilio Console |
| `TWILIO_VERIFY_SERVICE_SID` | Specifically points to your Twilio Verify service for OTPs. | Twilio Console -> Verify Service |
| `TWILIO_FROM_NUMBER` | The actual Twilio phone number used for sending standard SMS messages. | Twilio Console -> Phone Numbers |
| `TWILIO_WEBHOOK_SECRET` | Webhook security string (Generated: `twsec_8f92a4b1c7d3e6f5g8h0j2k4l6m8n9p1`). | Developer generated |
| `USPS_CONSUMER_KEY` | Geocodes and validates physical agricultural addresses. | USPS Web Tools API |
| `USPS_CONSUMER_SECRET`| Authenticates USPS Web Tools API. | USPS Web Tools API |

### C. Communications (Push & Email)
| Secret | Purpose | Source |
| :--- | :--- | :--- |
| `POSTMARK_SERVER_TOKEN` | Transactional router (Receipts, Welcome emails). | Postmark -> Primary Server -> API Tokens |
| `POSTMARK_BROADCAST_TOKEN`| Core Broadcast routing (Daily Grower Digest). | Postmark -> Broadcast Server -> API Tokens |
| `POSTMARK_MESSAGE_STREAM` | Outbound stream routing identifier. | Usually `outbound` |
| `VAPID_PUBLIC_KEY` | Supabase-side public key (matches Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY`). | `BNekJ12j-POg5NswygqWO1iCZjKx8ErjnJd35smwv1ST9mKXWV3v-8AgJ96DmD9nbgPbfMHtCeKe6_tjXVtEzCs` |
| `VAPID_PRIVATE_KEY` | Cryptographic signer for Web Push. **Never expose to frontend.** | `L4MTDJ2gTMbt3eKSmjF5ZEeWm_btAMfDQxG2NDNUocE` |
| `VAPID_SUBJECT` | Admin contact for VAPID protocol. | `mailto:support@casagrown.com` |

### D. Artificial Intelligence (CasaBot & Moderation)
| Secret | Purpose | Source |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | AI Vision analysis for verifying product photos. | Google Cloud Platform / Vertex AI |
| `OPENROUTER_API_KEY` | Fallback routing for Multi-LLM model engines. | OpenRouter Dashboard |
| `AI_MODEL` | Explicitly binds the model engine. | e.g. `gemma-4-31b-it` |

### E. App Configuration URLs
| Secret | Purpose | Source |
| :--- | :--- | :--- |
| `SITE_URL` | Used dynamically to format link anchors in password reset emails. | e.g. `https://casagrown.com` |
| `MARKET_APP_URL` | Used to deeply link flagging/moderator notifications. | e.g. `https://market.casagrown.com` |

---

## 3. Webhook Infrastructure

> [!WARNING]
> **CRITICAL DEPLOYMENT GOTCHA**: All Edge Functions default to requiring a valid Supabase User JWT. Since external services (PayPal, Stripe, etc.) do not have User JWTs, they will receive a `401 Unauthorized` error from the API Gateway before the code even executes.
> 
> You **MUST** ensure all webhooks are listed in your `supabase/config.toml` file with `verify_jwt = false`. 
> 
> If you deploy a new webhook without adding it to `config.toml`, you must manually bypass it during deployment: `supabase functions deploy [function_name] --no-verify-jwt`.

To keep Supabase completely synchronized with external physical world events, you must log into the dashboard of the following third parties and point their webhooks to your Supabase Edge Functions.

### A. Stripe Webhook
*   **Destination URL**: `https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1/stripe-webhook`
*   **Events**: `checkout.session.completed` (Fulfills orders after cash capture), `account.updated` (Updates merchant KYC onboarding status).

### B. PayPal / Venmo Webhook
*   **Destination URL**: `https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1/webhook-paypal`
*   **Events**: `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.FAILED` (Synchronizes PayPal & Venmo cashout statuses with your DB).

### C. Tremendous Webhook (US Gift Cards / Cashouts)
*   **Destination URL**: `https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1/webhook-tremendous`
*   **Events**: `rewards.completed`, `rewards.failed` (Notifies user and releases escrow if failed).

### D. Reloadly Webhook (Global Cashouts)
*   **Destination URL**: `https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1/webhook-reloadly`
*   **Events**: `transaction.success`, `transaction.failed` (Handles async Global/LatAm redemption resolutions).

### E. Twilio Status Webhook (Optional but Recommended)
*   **Destination URL**: `https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1/webhook-twilio?secret=twsec_8f92a4b1c7d3e6f5g8h0j2k4l6m8n9p1`
*   **Events**: "A MESSAGE COMES IN" (Handles STOP/START SMS replies to update user's `twilio_blocked` boolean).

---

## 4. GitHub Configuration (CI/CD)

If you are running the `quarantine-bot` or Playwright regression suites natively in GitHub actions, you only need to ensure GitHub has access to a dedicated staging environment so it does not corrupt Production.

| Secret | Purpose |
| :--- | :--- |
| `SUPABASE_URL` | Staging Supabase URL for E2E tests. |
| `SUPABASE_ANON_KEY` | Staging Anon Key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Allows Github to seed database and wipe tables. |

*(Note: Vercel automatically deploys pushes to Git `main`. You do not need explicit GitHub Action workflow keys for Next.js since Vercel automatically assumes authority).*

---

## 5. Production Health Monitoring

You can proactively scan the database for failed payouts, unresolved escalations, and critical errors without having to manually dig through tables.

### A. The Audit Script
Run the built-in audit script from your terminal:
```bash
SUPABASE_SERVICE_ROLE_KEY="[YOUR_SERVICE_KEY]" npx tsx scripts/audit-production-errors.ts
```

### B. Finding your `SUPABASE_SERVICE_ROLE_KEY`
This key acts as the master password to your database, bypassing all Row Level Security. **Never commit it to your repository or expose it to the frontend.**

To find your remote key:
1. Log into your **Supabase Dashboard** and select your project.
2. Click the **Project Settings** (gear icon) in the bottom left.
3. Click **API** under Configuration.
4. Under the **Project API keys** section, look for the key labeled `service_role` and `secret`.
5. Click the eye icon to reveal and copy it.
