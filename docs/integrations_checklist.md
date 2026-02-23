# Integration Checklist — Pre-Launch

Last Updated: 2026-02-23

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

| Item                                     | Status | Notes                                  |
| :--------------------------------------- | :----- | :------------------------------------- |
| Client ID (`RELOADLY_CLIENT_ID`)         | ⬜     | Set in Supabase Edge Function secrets  |
| Client Secret (`RELOADLY_CLIENT_SECRET`) | ⬜     | Set in Supabase Edge Function secrets  |
| Switch sandbox → production              | ⬜     | `isSandbox` param in `reloadly.ts`     |
| Catalog caching strategy                 | ⬜     | Currently fetches live on each request |
| Test gift card order end-to-end          | ⬜     | Verify card code delivered             |
| Error handling for out-of-stock          | ⬜     | Graceful UI fallback needed            |

## Tremendous (Gift Cards)

| Item                               | Status | Notes                                            |
| :--------------------------------- | :----- | :----------------------------------------------- |
| API key (`TREMENDOUS_API_KEY`)     | ⬜     | Set in Supabase Edge Function secrets            |
| Switch testflight → production URL | ⬜     | `tremendous.ts` uses `testflight.tremendous.com` |
| Test gift card order end-to-end    | ⬜     | Verify reward link delivered                     |
| Funding source configuration       | ⬜     | Currently hardcoded to `"balance"`               |

## GlobalGiving (Donations)

| Item                             | Status | Notes                                          |
| :------------------------------- | :----- | :--------------------------------------------- |
| API key (`GLOBALGIVING_API_KEY`) | ⬜     | Not yet implemented                            |
| Client implementation            | ⬜     | No `globalgiving.ts` file exists yet           |
| Donation flow edge function      | ⬜     | Needs `redeem-points` to call GlobalGiving API |
| Test donation end-to-end         | ⬜     | Verify receipt created                         |

## Authentication

| Item                              | Status | Notes                              |
| :-------------------------------- | :----- | :--------------------------------- |
| Google OAuth keys                 | ⬜     | Production Google Cloud project    |
| Apple Sign-In key                 | ⬜     | App Store Connect config           |
| Supabase project URL (production) | ⬜     | Replace `localhost:54321` URLs     |
| Remove dev OTP auto-fill          | ⬜     | `login-screen.tsx` dev mode bypass |
| Remove mock auth mode             | ⬜     | `auth-hook.ts` mock user path      |

## Edge Functions — Deployment

| Function                | Status | Notes                                              |
| :---------------------- | :----- | :------------------------------------------------- |
| `create-payment-intent` | ✅     | Handles mock + Stripe providers                    |
| `confirm-payment`       | ✅     | Credits points via `point_ledger`                  |
| `stripe-webhook`        | ⬜     | Needs production webhook URL                       |
| `redeem-points`         | ⬜     | Needs Reloadly/Tremendous/GlobalGiving integration |
| `gift-card-catalog`     | ⬜     | Fetches combined catalog from providers            |

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

# Supabase (production)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
