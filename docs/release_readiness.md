# Release Readiness Checklist

This document tracks items that must be completed before production release.

## 🔴 Critical - Must Complete Before Release

### Authentication Configuration

| Item                        | Status     | Description                                             |
| --------------------------- | ---------- | ------------------------------------------------------- |
| **Social Login Keys**       | ⏳ Pending | Configure OAuth keys for Google, Apple, and Facebook    |
| **Remove Mock Mode**        | ⏳ Pending | Remove forced mock login in `auth-hook.ts`              |
| **Supabase Production URL** | ⏳ Pending | Update `.env` with production Supabase URL and Anon Key |
| **Remove Dev OTP Display**  | ⏳ Pending | Remove Inbucket OTP fetch code (dev-only)               |

### Current Mock Behavior

The following authentication behaviors are **mocked** for development:

1. **Social Login (Google/Apple/Facebook)**
   - File: `packages/app/features/auth/auth-hook.ts`
   - Current: Falls back to password login with `mock@social.com`
   - Required: Configure real OAuth with provider keys

2. **Email OTP Display**
   - File: `packages/app/features/auth/auth-hook.ts`
   - Current: Fetches OTP from local Inbucket for dev testing
   - Required: Remove this block for production

### Required Environment Variables

```bash
# Production Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key

# OAuth Providers (configure in Supabase Dashboard)
# - Google: Client ID and Secret
# - Apple: Service ID and Key
# - Facebook: App ID and Secret
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

---

_Last Updated: 2026-02-14_
