# Market Architecture Design

## Overview

CasaGrown Market is a Next.js web application that extends the CasaGrown
platform with a **1-day-per-week** farmers' market experience. It reuses the
shared Supabase backend (auth, profiles, points) and adds market-specific tables.

## System Architecture

```
┌─────────────────────────────────┐
│       Next.js Market App        │
│       (localhost:3001)           │
│                                 │
│  ┌──────────┐  ┌──────────┐    │
│  │  Login    │  │  My Booth │    │
│  │  (OTP)   │  │  Products │    │
│  └──────────┘  │  Coupons  │    │
│  ┌──────────┐  │  Invite   │    │
│  │  Terms   │  └──────────┘    │
│  │  (ToS)   │  ┌──────────┐    │
│  └──────────┘  │  Browse   │    │
│                │  Markets  │    │
│                └──────────┘    │
└─────────────┬───────────────────┘
              │ Supabase JS Client
              ▼
┌─────────────────────────────────┐
│      Shared Supabase Backend     │
│                                 │
│  ┌───────────────────────────┐  │
│  │  auth.users (Supabase)    │  │
│  │  profiles (shared)        │  │
│  │  point_ledger (shared)    │  │
│  ├───────────────────────────┤  │
│  │  market_booths   (new)    │  │
│  │  market_products (new)    │  │
│  │  market_coupons  (new)    │  │
│  └───────────────────────────┘  │
│                                 │
│  Edge Functions:                │
│  ├─ send-notification-email     │
│  ├─ (OTP via GoTrue built-in)   │
│  └─ market-specific (future)    │
└─────────────────────────────────┘
```

## Shared vs. Market-Specific

| Layer          | Shared with Community     | Market-Specific           |
| :------------- | :------------------------ | :------------------------ |
| Auth           | Supabase Auth (GoTrue)    | —                         |
| Profiles       | `profiles` table          | —                         |
| Points         | `point_ledger`            | —                         |
| Email          | Postmark / Mailpit        | —                         |
| ToS            | `tos_accepted_at` column  | —                         |
| Booths         | —                         | `market_booths`           |
| Products       | —                         | `market_products`         |
| Orders         | —                         | `market_orders` (future)  |

## Key Principles

1. **No community schema changes** — Market only adds new `market_*` tables.
2. **No seller approval** — Any user can create a booth and become a seller.
3. **Single identity** — One `profiles` row serves both community and market.
4. **Per-market-day products** — Products are ephemeral, tied to a specific market date.
5. **Booth-level delivery** — Delivery/pickup settings on the booth, not per product.
6. **1-day marketplace** — Each booth has a designated market day of the week.

## Auth Flow

```
Email → OTP (magic link) → Verify OTP → Check tos_accepted_at
  └─ null → /terms (accept) → /my-booth
  └─ set  → /my-booth
```

Supabase GoTrue handles OTP generation, rate limiting, and verification.
The branded email template (`supabase/templates/magic_link.html`) is used.
In production, emails go via Postmark SMTP; locally via Mailpit.

## RLS Strategy

All market tables use the same pattern:
- **Read**: Public (anyone can browse)
- **Write**: Owner-only (verified via `auth.uid()` → `market_booths.owner_id`)

Products and coupons use a subquery to verify booth ownership:
```sql
booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid())
```

## Future Extensions

| Feature             | Table/Function                    | Notes                          |
| :------------------ | :-------------------------------- | :----------------------------- |
| Market orders       | `market_orders` + atomic RPC      | Similar to community orders    |
| Per-product coupons | Future enhancement          | If needed later             |
| Reviews/ratings     | `market_reviews`            | Buyer feedback on products  |
| Market schedule     | `market_schedule`                 | Weekly booth hours             |
| Delivery tracking   | `market_deliveries`               | Status, ETA, proof of delivery |
