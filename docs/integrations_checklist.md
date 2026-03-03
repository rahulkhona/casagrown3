# Integration Checklist — Pre-Launch

Last Updated: 2026-03-03

## Stripe (Payments)

| Item                                                   | Status | Notes                                                   |
| :----------------------------------------------------- | :----- | :------------------------------------------------------ |
| Publishable key (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) | ⬜     | Set in `.env.local` / Vercel                            |
| Secret key (`STRIPE_SECRET_KEY`)                       | ⬜     | Set in Supabase Edge Function secrets                   |
| Webhook secret (`STRIPE_WEBHOOK_SECRET`)               | ⬜     | Set in Supabase Edge Function secrets                   |
| Webhook endpoint configured                            | ⬜     | `POST /functions/v1/stripe-webhook`                     |
| `stripePaymentService.ts` web flow                     | ✅     | Stripe.js `confirmCardPayment` implemented              |
| Native SDK (`@stripe/stripe-react-native`)             | ⬜     | Currently falls back to server-side confirm             |
| Replace mock card inputs with Stripe Elements          | ⬜     | `BuyPointsSheet.tsx` still uses `CardField` placeholder |
| Switch `PAYMENT_MODE` from `mock` to `stripe`          | ⬜     | `NEXT_PUBLIC_PAYMENT_MODE` / `EXPO_PUBLIC_PAYMENT_MODE` |
| Test live payment end-to-end                           | ⬜     | Verify points credited after real charge                |

## Reloadly (Gift Cards)

| Item                                     | Status | Notes                                    |
| :--------------------------------------- | :----- | :--------------------------------------- |
| Client ID (`RELOADLY_CLIENT_ID`)         | ⬜     | Set in Supabase Edge Function secrets    |
| Client Secret (`RELOADLY_CLIENT_SECRET`) | ⬜     | Set in Supabase Edge Function secrets    |
| Switch sandbox → production              | ⬜     | `isSandbox` param in `reloadly.ts`       |
| Catalog caching strategy                 | ✅     | Cached in `platform_config` (24h TTL)    |
| Test gift card order end-to-end          | ⬜     | Verify card code delivered               |
| Error handling for out-of-stock          | ✅     | Queued + retry via `process-redemptions` |

## Tremendous (Gift Cards)

| Item                               | Status | Notes                                            |
| :--------------------------------- | :----- | :----------------------------------------------- |
| API key (`TREMENDOUS_API_KEY`)     | ⬜     | Set in Supabase Edge Function secrets            |
| Switch testflight → production URL | ⬜     | `tremendous.ts` uses `testflight.tremendous.com` |
| Test gift card order end-to-end    | ⬜     | Verify reward link delivered                     |
| Funding source configuration       | ⬜     | Currently hardcoded to `"balance"`               |

## GlobalGiving (Donations)

| Item                              | Status | Notes                                                    |
| :-------------------------------- | :----- | :------------------------------------------------------- |
| API key (`GLOBALGIVING_API_KEY`)  | ⬜     | Set in Supabase Edge Function secrets                    |
| `donate-points` edge function     | ✅     | Implemented with ACID `finalize_donation_redemption` RPC |
| `fetch-donation-projects` edge fn | ✅     | Fetch/search project catalog with fallback               |
| Switch sandbox → production       | ⬜     | `GLOBALGIVING_SANDBOX=false`                             |
| Test donation end-to-end          | ⬜     | Verify receipt created + points debited                  |

## PayPal / Venmo (Cashouts)

| Item                              | Status | Notes                                           |
| :-------------------------------- | :----- | :---------------------------------------------- |
| Client ID (`PAYPAL_CLIENT_ID`)    | ⬜     | Set in Supabase Edge Function secrets           |
| Secret (`PAYPAL_SECRET`)          | ⬜     | Set in Supabase Edge Function secrets           |
| `redeem-paypal-payout` edge fn    | ✅     | PayPal Payouts API (email + Venmo phone)        |
| `refund-purchased-points` edge fn | ✅     | Routes to Stripe/Venmo/gift card refund         |
| Provider gating                   | ✅     | `available_redemption_method_instruments` table |
| Switch sandbox → production       | ⬜     | PayPal sandbox URL → `api.paypal.com`           |
| Fund PayPal business balance      | ⬜     | Required for live payouts                       |
| Test cashout end-to-end           | ⬜     | Verify payout delivered + points debited        |

> [!IMPORTANT]
> **No tests hit live PayPal/Venmo APIs.** All payout tests validate input/error
> paths before reaching the API call, or are statically skipped.

## Authentication

| Item                              | Status | Notes                              |
| :-------------------------------- | :----- | :--------------------------------- |
| Email + OTP authentication        | ✅     | Implemented via Supabase Auth      |
| Supabase project URL (production) | ⬜     | Replace `localhost:54321` URLs     |
| Remove dev OTP auto-fill          | ⬜     | `login-screen.tsx` dev mode bypass |

> [!NOTE]
> Social login (Google/Apple/Facebook) has been **removed**. Auth is email + OTP
> only.

## Edge Functions — Deployment

| Function                   | Status | Notes                                 |
| :------------------------- | :----- | :------------------------------------ |
| `create-payment-intent`    | ✅     | Handles mock + Stripe providers       |
| `confirm-payment`          | ✅     | Credits points via `point_ledger`     |
| `stripe-webhook`           | ⬜     | Needs production webhook URL          |
| `create-order`             | ✅     | Atomic order + escrow                 |
| `create-offer`             | ✅     | Atomic offer creation                 |
| `redeem-gift-card`         | ✅     | Reloadly + Tremendous providers, ACID |
| `redeem-paypal-payout`     | ✅     | PayPal/Venmo cashout, ACID            |
| `refund-purchased-points`  | ✅     | Stripe/Venmo/gift card refund routes  |
| `donate-points`            | ✅     | GlobalGiving donations, ACID          |
| `fetch-gift-cards`         | ✅     | Merged catalog with caching           |
| `fetch-donation-projects`  | ✅     | GlobalGiving project search           |
| `process-redemptions`      | ✅     | Queue-based redemption processor      |
| `sync-provider-balance`    | ✅     | Cron: monitor provider balances       |
| `get-tax-rate`             | ✅     | California sales tax lookup           |
| `register-push-token`      | ✅     | Device token upsert                   |
| `send-push-notification`   | ✅     | Web Push + APNs + FCM                 |
| `notify-on-message`        | ✅     | Push trigger for chat messages        |
| `resolve-community`        | ✅     | H3 community resolution               |
| `enrich-communities`       | ✅     | OSM-based community naming            |
| `pair-delegation`          | ✅     | Delegation pairing                    |
| `assign-experiment`        | ✅     | A/B test assignment                   |
| `resolve-pending-payments` | ✅     | Stuck payment recovery                |
| `sync-locations`           | ✅     | Country reference data                |
| `update-zip-codes`         | ✅     | Zip code data processing              |

## Environment Variables Summary

```bash
# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_PAYMENT_MODE=stripe  # or 'mock' for testing

# Reloadly
RELOADLY_CLIENT_ID=...
RELOADLY_CLIENT_SECRET=...
RELOADLY_SANDBOX=false

# Tremendous
TREMENDOUS_API_KEY=...

# GlobalGiving
GLOBALGIVING_API_KEY=...
GLOBALGIVING_SANDBOX=false

# PayPal / Venmo (Cashouts)
PAYPAL_CLIENT_ID=...
PAYPAL_SECRET=...

# Push Notifications
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:support@casagrown.dev
APNS_KEY_ID=...          # iOS only
APNS_TEAM_ID=...         # iOS only
APNS_KEY=...             # iOS only (.p8 contents)
FCM_SERVER_KEY=...       # Android only

# Supabase (production)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
