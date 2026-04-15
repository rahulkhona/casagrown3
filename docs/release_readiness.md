# Release Readiness Checklist

This document tracks items that must be completed before production release.

## 🔴 Critical - Must Complete Before Release

### Authentication Configuration

| Item                        | Status     | Description                                             |
| --------------------------- | ---------- | ------------------------------------------------------- |
| **Supabase Production URL** | ⏳ Pending | Update `.env` with production Supabase URL and Anon Key |
| **Remove Dev OTP Display**  | ⏳ Pending | Remove Inbucket OTP fetch code (dev-only)               |

> [!NOTE]
> Social login (Google/Apple/Facebook) has been **removed**. Authentication is
> email + OTP only via Supabase Auth.

### Current Mock Behavior

The following authentication behaviors are **mocked** for development:

1. **Email OTP Display**
   - File: `packages/app/features/auth/auth-hook.ts`
   - Current: Fetches OTP from local Inbucket/Mailpit for dev testing
   - Required: Remove this block for production

### Required Environment Variables

```bash
# Production Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key
```

### Payment & Stripe Configuration

| Item                            | Status     | Description                                                               |
| ------------------------------- | ---------- | ------------------------------------------------------------------------- |
| **Switch to Stripe provider**   | ⏳ Pending | Set `NEXT_PUBLIC_PAYMENT_MODE=stripe` / `EXPO_PUBLIC_PAYMENT_MODE=stripe` |
| **Stripe publishable key**      | ⏳ Pending | Set `NEXT_PUBLIC_STRIPE_KEY` / `EXPO_PUBLIC_STRIPE_KEY`                   |
| **Stripe secret key**           | ⏳ Pending | `supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx`                      |
| **Stripe webhook secret**       | ⏳ Pending | `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx`                    |
| **Stripe webhook endpoint**     | ⏳ Pending | Configure in Stripe Dashboard → Events: `payment_intent.succeeded/failed` |
| **Replace mock card inputs**    | ⏳ Pending | Replace TextInputs in `BuyPointsSheet.tsx` with Stripe Elements           |
| **Finish stripePaymentService** | ⏳ Pending | ~15 lines: call `stripe.confirmCardPayment()` in `confirmPayment()`       |

#### Switching to Stripe (Step-by-Step)

1. Set environment variables (see table above)
2. In Stripe Dashboard: create webhook endpoint → your `stripe-webhook` edge
   function URL
3. Subscribe to events: `payment_intent.succeeded`,
   `payment_intent.payment_failed`
4. Install Stripe Elements: `@stripe/react-stripe-js` (web),
   `@stripe/stripe-react-native` (native)
5. Replace 4 mock `TextInput` fields in `BuyPointsSheet.tsx` with
   `<CardElement>` (web) or `<CardField>` (native)
6. Update `stripePaymentService.ts` `confirmPayment()` to call
   `stripe.confirmCardPayment()`
7. Deploy edge functions: `create-payment-intent`, `confirm-payment`,
   `stripe-webhook`, `resolve-pending-payments`, `create-order`

> [!IMPORTANT]
> The backend (edge functions, DB, point_ledger) is **already
> production-ready**. Only the frontend card input UI needs to be swapped from
> mock to Stripe Elements.

---

## 🟡 Recommended Before Release

| Item                   | Status     | Description                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ATS Hardening          | ⏳ Pending | Remove `NSAllowsArbitraryLoads: true` from iOS `app.json`                                                                                                                                                                                                                                |
| Debug Alerts           | ⏳ Pending | Review and remove any remaining `alert()` calls                                                                                                                                                                                                                                          |
| Console Logs           | ⏳ Pending | Remove verbose dev logging (🔧, 🤖, etc.)                                                                                                                                                                                                                                                |
| **Media Optimization** | ⏳ Pending | Compress avatars (400px, 80% JPEG) & videos (`react-native-compressor`, auto mode, 720p max) before upload. Code was written & reverted (`fd6cef3` → `45503b5`) — re-apply and test on physical device before release. See `implementation_plan.md` in brain artifacts for full details. |

---

## 🟢 Production Build Optimizations (Done)

The following optimizations are configured in
`apps/next-community/next.config.js`:

| Item                         | Status  | Details                                                                 |
| ---------------------------- | ------- | ----------------------------------------------------------------------- |
| **Standalone output**        | ✅ Done | `output: 'standalone'` — deploy size ~843MB → ~50MB                     |
| **TypeScript build errors**  | ✅ Done | Removed `ignoreBuildErrors: true` — catches TS errors at build time     |
| **Bundle analyzer**          | ✅ Done | `@next/bundle-analyzer` — run `ANALYZE=true yarn next build` to inspect |
| **Realtime channel scoping** | ✅ Done | Global channels scoped to `userId` to avoid 500-connection limit        |

### How to Deploy an Optimized Build

```bash
# 1. Build the production bundle
cd apps/next-community && yarn next build

# 2. (Optional) Inspect bundle sizes
cd apps/next-community && ANALYZE=true yarn next build

# 3. The standalone output is in .next/standalone/
#    Copy static assets for deployment:
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# 4. Start the production server
cd .next/standalone && node server.js
```

> [!TIP]
> For Vercel deployments, `output: 'standalone'` is automatically detected. Just
> connect the repo and set Root Directory to `apps/next-community`.

---

## 🟢 Verified Ready

| Item                                   | Status   |
| -------------------------------------- | -------- |
| Profile creation trigger               | ✅ Works |
| 50pt signup reward                     | ✅ Works |
| Email/OTP flow (UI)                    | ✅ Works |
| Navigation (Login → Success → Home)    | ✅ Works |
| Localization (EN/ES/VI)                | ✅ Works |
| Mock payment flow (buy points)         | ✅ Works |
| Server-side point crediting            | ✅ Works |
| Payment transactions table             | ✅ Works |
| Order creation with point debit/credit | ✅ Works |
| Points balance loaded from DB          | ✅ Works |
| Pending payment recovery on app open   | ✅ Works |
| Stripe web payment (Stripe.js)         | ✅ Works |
| ACID redemptions (gift card/donation)  | ✅ Works |
| Profile wizard (2-step onboarding)     | ✅ Works |
| Social login removed (email+OTP only)  | ✅ Done  |
| Campaign rewards system                | ✅ Works |

---

## 🟡 Push Notifications — Credential-Gated

All push notification code is implemented and activated by providing
credentials. See
[push-notification-release-readiness.md](push-notification-release-readiness.md)
and [developer_guide.md § 5.7](developer_guide.md) for full setup instructions.

| Item                          | Status     | How to Enable                                                                  |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------ |
| **Web Push (VAPID)**          | ✅ Active  | Keys in `.env.local` + `supabase/.env.local`                                   |
| **iOS Push (APNs)**           | ⏭️ Pending | Set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY` + install expo-notifications     |
| **Android Push (FCM)**        | ⏭️ Pending | Set `FCM_SERVER_KEY` + add `google-services.json` + install expo-notifications |
| **push_subscriptions table**  | ✅ Created | Migration applied locally                                                      |
| **register-push-token fn**    | ✅ Done    | Edge function deployed                                                         |
| **send-push-notification fn** | ✅ Done    | Web Push active, APNs/FCM gated on keys                                        |

---

## 🔴 Integration Providers — Pending

> [!IMPORTANT]
> For the full integration checklist with env vars and deployment steps, see
> [integrations_checklist.md](integrations_checklist.md).

| Provider         | Status       | Description                                                                |
| ---------------- | ------------ | -------------------------------------------------------------------------- |
| Reloadly         | ⏳ Pending   | Gift card catalog + ordering. `reloadly.ts` implemented, needs prod keys   |
| Tremendous       | ⏳ Pending   | Gift card ordering. `tremendous.ts` implemented, needs prod URL + key      |
| GlobalGiving     | ✅ Code Done | Charitable donations. Edge function + UI implemented, needs prod API key   |
| PayPal/Venmo     | ✅ Code Done | Cashout via PayPal Payouts API. Edge function implemented, needs prod keys |
| Feature Waitlist | ✅ Done      | `feature_waitlist` table + RLS live                                        |

---

## 🟡 Twilio SMS — Approval-Gated

All SMS code is implemented, tested, and deployed. SMS dispatch is **explicitly
blocked** at the edge function layer until Twilio account approval is confirmed
and credentials are added.

> [!WARNING]
> Do **not** set `ENABLE_PHONE_VERIFICATION=true` on Supabase until Twilio
> account approval is confirmed. Setting it without credentials will cause the
> `send-sms-notification` function to error.

| Item                           | Status        | Notes                                                          |
| ------------------------------ | ------------- | -------------------------------------------------------------- |
| **SMS code & edge functions**  | ✅ Deployed   | `send-sms-notification`, `send-crm-campaign`, `twilio-campaign-webhook` |
| **CRM SMS campaign path**      | ✅ Deployed   | `send-crm-campaign` handles channel=sms via `_shared/twilio.ts` |
| **Feature flag (server-side)** | 🔒 OFF        | `ENABLE_PHONE_VERIFICATION` not set on Supabase secrets        |
| **UI opt-in fields**           | ✅ Showing    | `NEXT_PUBLIC_ENABLE_PHONE_VERIFICATION=true` in `.env.local`   |
| **Twilio account approval**    | ⏭️ Pending   | Credits purchased (2026-04-15). Awaiting account approval.     |

### Activation Steps (run once Twilio is approved)

```bash
# 1. Set Twilio credentials on Supabase (from console.twilio.com → Account Info)
supabase secrets set \
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  TWILIO_FROM_NUMBER=+1xxxxxxxxxx \
  ENABLE_PHONE_VERIFICATION=true

# 2. Also set in Vercel env vars for the market app (UI flag)
NEXT_PUBLIC_ENABLE_PHONE_VERIFICATION=true

# 3. Redeploy edge functions to pick up new secrets
supabase functions deploy send-sms-notification send-crm-campaign twilio-campaign-webhook

# 4. Verify with a test SMS (replace with a real number)
curl -X POST https://<project>.supabase.co/functions/v1/send-sms-notification \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "<test-user-uuid>", "message": "Test SMS from CasaGrown 🌱"}'
```

> [!NOTE]
> The SMS feature flag is **server-side only** in the edge function. The UI
> (`NEXT_PUBLIC_ENABLE_PHONE_VERIFICATION`) only controls whether the phone
> opt-in fields are shown. SMS dispatch is always blocked if Twilio secrets
> are absent, regardless of the UI flag.

---

## 🟢 CRM & Marketing Platform — v1.23 (Live)

Full CRM and marketing infrastructure deployed as of **2026-04-15 (v1.23)**.

| Item                              | Status      | Details                                                             |
| --------------------------------- | ----------- | ------------------------------------------------------------------- |
| **CRM schema** (`crm_leads` etc.) | ✅ Deployed | Migration `20260415120000_crm_schema.sql` applied to staging        |
| **Lead capture** (`/join`)        | ✅ Live     | Anon POST to `crm_leads` via PostgREST (return=minimal)             |
| **Marketing pages** (`/sellers`)  | ✅ Live     | Analytics beacon + CRM attribution                                  |
| **Short links** (`/r/[token]`)    | ✅ Live     | Click tracking, redirect, campaign attribution                      |
| **Analytics beacon**              | ✅ Live     | `/api/crm/track` — graceful no-op if service role key absent        |
| **FB Lead webhook**               | ✅ Deployed | `receive-facebook-lead` edge function                               |
| **Postmark webhook**              | ✅ Deployed | `postmark-webhook` edge function                                    |
| **Campaign sender**               | ✅ Deployed | `send-crm-campaign` — email via Postmark, SMS via Twilio (gated)    |
| **Admin metrics**                 | ✅ Live     | Funnel, A/B, traffic source, ROI analytics in next-metrics          |
| **E2E tests**                     | ✅ 36/36    | `landing-pages.spec.ts` + `notifications-payouts.spec.ts` passing   |

### Local Dev Environment Notes

Add these to `apps/next-market/.env` for local testing (already in gitignored file):
```bash
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>  # from: supabase status --output env
```

The `crm/track` beacon and `/r/[token]` redirect degrade gracefully if the
service role key is absent — they return `{ok:true,skipped:true}` and fall back
to anon key respectively, so local tests still pass.

---

_Last Updated: 2026-04-15_
