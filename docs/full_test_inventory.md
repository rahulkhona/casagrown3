# CasaGrown Market — Full Test Inventory

> **Total: 2,189 tests across 179 files (5 suites)**

| Suite | Files | Tests | Status |
|-------|-------|-------|---------|
| Vitest (Market) | 49 | 672 | ✅ 672/672 PASS |
| Vitest (Admin) | 5 | 73 | ✅ 72/73 (1 build timeout) |
| Vitest (Metrics) | 1 | 29 | ✅ 29/29 PASS |
| Vitest (Voice) | 1 | 36 | ✅ 36/36 PASS |
| Playwright (Market) | 45 | 562 | — |
| Playwright (Admin) | 10 | 79 | — |
| pgTAP (Database) | 40 | 555 | ✅ 555/555 PASS |
| Deno (Edge Functions) | 29 | 265 | ✅ 265/265 PASS |
| Shell (Integration) | 1 | 11 | ✅ 11/11 PASS |
| **TOTAL** | **179** | **2,189** | |

---

## 1. pgTAP — Database Tests (530 assertions, 39 files) ✅ ALL PASS

| # | Tests | File | Domain |
|---|-------|------|--------|
| 01 | 10 | `01_jurisdiction_restrictions.test.sql` | State blocking, compliance |
| 02 | 17 | `02_market_schema.test.sql` | Table/column/function existence |
| 03 | 58 | `03_market_settlement.test.sql` | Settlement calculation, reconciliation |
| 04 | 42 | `04_market_settlement_stress.test.sql` | 8-user, 20-order stress test |
| 05 | 26 | `05_balance_first_hold.test.sql` | Balance-first ordering, holds |
| 06 | 6 | `06_product_expiration.test.sql` | Auto-expire stale products |
| 07 | 8 | `07_market_schedule.test.sql` | Market day scheduling |
| 08 | 3 | `08_platform_fees.test.sql` | Fee calculation |
| 09 | 4 | `09_tax_thresholds.test.sql` | Tax threshold triggers |
| 10 | 3 | `10_flagging_flow.test.sql` | Product flag threshold auto-hide |
| 11 | 3 | `11_banned_users.test.sql` | Ban enforcement |
| 12 | 5 | `12_place_order.test.sql` | Order placement flow |
| 13 | 3 | `13_transaction_summary.test.sql` | Transaction aggregation |
| 14 | 7 | `14_analytics_and_functions.test.sql` | Analytics views |
| 15 | 12 | `15_rls_policies.test.sql` | Row-level security |
| 16 | 13 | `16_triggers_and_functions.test.sql` | Trigger correctness |
| 17 | 6 | `17_market_state_blocks.test.sql` | State-level blocking |
| 18 | 8 | `18_listing_lifecycle.test.sql` | Product lifecycle states |
| 19 | 10 | `19_order_completion_receipts.test.sql` | Receipt generation |
| 20 | 38 | `20_cash_flow_system.test.sql` | Ledger, settlements, payouts |
| 21 | 32 | `21_payout_system.test.sql` | Payout requests, approval |
| 22 | 8 | `22_payout_stress_test.test.sql` | Payout volume stress |
| 23 | 11 | `23_100k_stress_test.test.sql` | 100k-row stress test |
| 25 | 6 | `25_market_lifecycle_cron.test.sql` | Cron job lifecycle |
| 26 | 14 | `26_zone_pulse.test.sql` | H3 zone change tracking |
| 27a | 3 | `27_product_drafts.test.sql` | Draft products |
| 27b | 8 | `27_quarantine_zones.test.sql` | Quarantine zones |
| 28 | 1 | `28_moderation.test.sql` | Content moderation |
| 29 | 8 | `29_direct_messaging.test.sql` | DM system |
| 30 | 9 | `30_tax_system.test.sql` | Tax calculation |
| 31 | 22 | `31_multi_user_settlement.test.sql` | Multi-user settlement edge cases |
| 32 | 13 | `32_grower_search.test.sql` | Full-text grower search |
| 33 | 9 | `33_buyer_product_notifications.test.sql` | Buyer notifications |
| 34 | 20 | `34_order_status_notifications.test.sql` | Order status change notifications |
| 35 | 12 | `35_dispute_refund_rating.test.sql` | Dispute → refund → rating flow |
| 36 | 10 | `36_auto_payout_eligible.test.sql` | Auto-payout eligibility |
| 37 | 18 | `37_payout_events.test.sql` | Payout event webhook handling |
| 38 | 35 | `38_disputes_and_order_log.test.sql` | Disputes table, order_status_log triggers, RPC evidence assembly |
| 39 | 20 | `39_24hr_grace_period.test.sql` | **NEW** 24hr grace period: window helper, mark-ready/delivered timing, all 4 auto-action cron paths |
| 40 | 25 | `40_escalation_resolution_credits.test.sql` | **NEW** Escalation resolution: full/partial refund, credit buyer/seller/both, combo resolutions, FIFO credit, admin list/stats RPCs |

---

## 2. Vitest — Unit/Component Tests (701 tests, 53 files)

### Market App (49 files, 672 tests) ✅ ALL PASS

| Tests | File | Domain |
|-------|------|--------|
| 16 | `components-deep.test.tsx` | Component rendering |
| 7 | `demo-booths.test.tsx` | Demo booth data |
| 7 | `dynamic-pages.test.tsx` | Dynamic route pages |
| 27 | `lib-deep.test.tsx` | Library utilities deep |
| 20 | `lib-modules.test.tsx` | Library modules |
| 8 | `listing-lifecycle.test.tsx` | Listing state transitions |
| 32 | `orders-grouping.test.ts` | Order grouping logic |
| 30 | `pages-authed.test.tsx` | Authenticated page rendering |
| 33 | `pages-coverage.test.tsx` | Page coverage checks |
| 22 | `pages-deep.test.tsx` | Deep page rendering |
| 29 | `pages.test.tsx` | Page smoke tests |
| 21 | `product-detail-ux.deep.test.tsx` | Product detail UX |
| 2 | `stripe-return-url.test.ts` | Stripe return URL handling |
| 13 | `disputes.test.ts` | **NEW** Admin dispute RPCs, stripe_disputes CRUD, order_status_log triggers |

### Admin App (5 files, 73 tests)

| Tests | File | Domain |
|-------|------|--------|
| 1 | `build.test.ts` | Next.js build check |
| 1 | `dev.test.ts` | Dev server check |
| 14 | `settlements-payouts.test.ts` | Settlements & payouts RPCs |
| 13 | `disputes.test.ts` | **NEW** Dispute admin RPCs, CRUD, audit triggers |
| 22 | `escalations.test.ts` | **NEW** Escalation resolution RPCs: claim/relinquish, full/partial refund, credit buyer/seller/both combo, stats, list, FIFO credit, non-staff blocked |

---

## 3. Playwright — E2E Tests (626 tests, 54 files)

### Core E2E (19 files, 376 tests)

| Tests | File | Domain |
|-------|------|--------|
| 61 | `authed-interactions.spec.ts` | Authenticated user flows |
| 9 | `booth-deep.spec.ts` | Booth management deep |
| 7 | `booth-setup.spec.ts` | Booth creation |
| 4 | `chat.spec.ts` | Chat system |
| 71 | `complete-interactions.spec.ts` | Complete user journey |
| 18 | `comprehensive.spec.ts` | Comprehensive coverage |
| 8 | `earnings-flow.spec.ts` | Earnings flow |
| 7 | `earnings.spec.ts` | Earnings page |
| 9 | `financial-flow.spec.ts` | Financial flows |
| 7 | `first-booth-alpha.spec.ts` | First-time booth setup |
| 26 | `functional-flows.spec.ts` | Functional flow coverage |
| 7 | `listing-lifecycle.spec.ts` | Listing lifecycle |
| 5 | `login.spec.ts` | Authentication |
| 5 | `market-browse.spec.ts` | Market browsing |
| 7 | `order-deep.spec.ts` | Order deep flows |
| 5 | `order-flow.spec.ts` | Order flow |
| 20 | `pages-deep.spec.ts` | Page deep rendering |
| 15 | `pages.spec.ts` | Page smoke |
| 45 | `remaining-interactions.spec.ts` | Remaining interactions |
| 3 | `tos.spec.ts` | Terms of service |
| 44 | `user-interactions.spec.ts` | User interactions |
| 1 | `screenshot.spec.ts` | Visual regression |

### Admin Portal E2E (3 files, 35+ tests)

| Tests | File | Domain |
|-------|------|--------|
| 13 | `settlements-payouts.spec.ts` | **Admin** Settlements & payouts overview |
| 7 | `disputes.spec.ts` | **NEW** Admin disputes page, webhook-seeded data, stats cards, filter tabs |
| 15 | `escalations.spec.ts` | **NEW** Admin escalation pages: list page, detail page, stats cards, filter tabs, resolution types, claim workflow, sidebar nav |

### Scenario E2E (24 files, 186 tests)

| Tests | File | Domain |
|-------|------|--------|
| 7 | `booth-errors.spec.ts` | Booth error handling |
| 10 | `booth-management.spec.ts` | Booth CRUD |
| 1 | `casabot-community.spec.ts` | CasaBot integration |
| 8 | `cashout-errors.spec.ts` | Cashout error paths |
| 11 | `chat-social.spec.ts` | Chat social features |
| 3 | `community-moderation.spec.ts` | Community moderation |
| 22 | `deep-interactions.spec.ts` | Deep interaction flows |
| 6 | `digest-relist.spec.ts` | Digest & relist |
| 3 | `direct-messaging.spec.ts` | DMs |
| 14 | `earnings-flows.spec.ts` | Earnings edge cases |
| 1 | `feedback-report.spec.ts` | Feedback reporting |
| 22 | `notifications-payouts.spec.ts` | Notification + payout |
| 1 | `order-chat-shortcuts.spec.ts` | Order chat shortcuts |
| 6 | `order-flows.spec.ts` | Order flow scenarios |
| 14 | `order-grouping.spec.ts` | Order grouping |
| 1 | `pioneer-banner.spec.ts` | Pioneer banner |
| 8 | `profile-settings.spec.ts` | Profile & settings |
| 7 | `purchase-flow.spec.ts` | Purchase flow |
| 3 | `quarantine-listing.spec.ts` | Quarantine listings |
| 8 | `search-rating-profile.spec.ts` | Search, rating, profile |
| 10 | `smoke-test.spec.ts` | Smoke test |
| 2 | `toast-notifications.spec.ts` | Toast notifications |
| 8 | `transaction-pipeline.spec.ts` | Transaction pipeline |
| 2 | `zone-pulse.spec.ts` | Zone pulse |

---

## 4. Deno — Edge Function Tests (249 tests, 28 files)

| Tests | File | Domain |
|-------|------|--------|
| 14 | `cash_flow_test.ts` | Cash flow RPCs |
| 81 | `edge_functions_test.ts` | All edge function smoke |
| 20 | `phase4_release_tests.ts` | Phase 4 release validation |
| 22 | `background-functions.test.ts` | Background functions |
| 3 | `casabot.test.ts` | CasaBot AI |
| 8 | `cash-flow-rpcs.test.ts` | Cash flow RPC calls |
| 6 | `create-order.test.ts` | Order creation |
| 6 | `create-payment-intent.test.ts` | Payment intent creation |
| 7 | `execute-auto-payouts.test.ts` | Auto-payout execution |
| 5 | `get-tax-rate.test.ts` | Tax rate lookup |
| 5 | `grower-digest.test.ts` | Grower digest email |
| 37 | `indirect-market-functions.test.ts` | Indirect market functions |
| 6 | `market-hold.test.ts` | Market hold lifecycle |
| 5 | `market-purchase-gift-card.test.ts` | Gift card purchase |
| 4 | `market-schema.test.ts` | Market schema validation |
| 10 | `moderate-listing.test.ts` | Listing moderation |
| 18 | `negative-cases.test.ts` | Error/negative paths |
| 9 | `notification-functions.test.ts` | Notification functions |
| 5 | `notification-rpcs.test.ts` | Notification RPCs |
| 10 | `onboarding-functions.test.ts` | Onboarding flow |
| 10 | `payment-errors.test.ts` | Payment error handling |
| 10 | `payout-flow.test.ts` | Payout flow |
| 9 | `payout-rpcs.test.ts` | Payout RPCs |
| 5 | `phone-otp.test.ts` | Phone OTP |
| 3 | `place_market_order.test.ts` | Market order placement |
| 5 | `redemption-flow.test.ts` | Redemption flow |
| 8 | `refund-purchased-points.test.ts` | Refund purchased points |
| 10 | `sandbox-api.test.ts` | Sandbox API |
| 6 | `settlement-captures.test.ts` | Settlement captures |
| 12 | `stripe-webhook.test.ts` | Stripe webhook (incl. dispute lifecycle tests) |
| 5 | `submit-dispute-evidence.test.ts` | **NEW** Evidence submission: draft save, validation, API key check |
| 8 | `escalation-resolution.test.ts` | **NEW** Escalation resolution flow: full refund, credit buyer, credit both combo, claim/relinquish, admin comments, list/stats RPCs, non-staff access |

---

## 5. Shell — Integration Tests (11 tests, 1 file)

| Tests | File | Domain |
|-------|------|--------|
| 11 | `test-escalation-interactions.sh` | **NEW** Full escalation workflow: claim, comment, relinquish, non-staff block, full refund, combo credit_both, stats, list |
