# CasaGrown Comprehensive Email Architecture Report

This document exhaustively maps every single email generated across the **Market App**, **Admin App**, **Voice App**, and the **Supabase Edge Functions**.

## Core Email Framework Routing

| System Category | Specific Email Events | Trigger Mechanism | Underlying Dispatcher Code | Route |
| :--- | :--- | :--- | :--- | :--- |
| **Supabase Authentication** | Login Magic Links, Password Resets | Native `/login` endpoint | Native Supabase GoTrue Auth Daemon (`supabase/config.toml`) | **Transactional** (`POSTMARK_SERVER_TOKEN`) |
| **Lifecycle & Operations** | `order_placed`, `offer_made`, `order_delivered`, `order_disputed`, `dispute_resolved` | PostgreSQL triggers invoking `send-notification-email` | `sendTransactionEmail(...)` inside `_shared/postmark.ts` | **Transactional** (`POSTMARK_SERVER_TOKEN`) |
| **Financial Routing** | Payout status (`webhook-paypal`, `market-cashout-paypal`), Gift Cards (`webhook-tremendous`, `market-purchase-gift-card`), Utilities (`webhook-reloadly`), Donations, `points_purchase`, `points_refund` | Direct Edge Functions | `sendTransactionEmail(...)` inside `_shared/postmark.ts` | **Transactional** (`POSTMARK_SERVER_TOKEN`) |
| **Trust & Safety / Chat** | Trust & Safety takedowns (`notify-product-flagged`), Direct Messaging (`chat_initiated`, `notify-on-message`) | Direct Edge Functions | `sendTransactionEmail(...)` inside `_shared/postmark.ts` | **Transactional** (`POSTMARK_SERVER_TOKEN`) |

## Background & Marketing (CRON) Routing

| Scheduled System | Specific Email Events | Trigger Mechanism | Underlying Dispatcher Code | Route |
| :--- | :--- | :--- | :--- | :--- |
| **Market Switchboard** | `market_reminder` (Upcoming popup alert), `daily_digest` (Settlement receipt), `seller_lifecycle` (Restock Nudge) | `pg_cron` executing `/functions/v1/market-cron` | POSTs internally to `/functions/v1/send-market-email` -> `sendTransactionEmail(...)` | **Transactional** (`POSTMARK_SERVER_TOKEN`) |
| **Recommendation Engine** | `grower_digest` (Cross-meshing buyer searches with local seller inventory) | `pg_cron` executing `/functions/v1/market-cron` | Inline raw `fetch("https://api.postmarkapp.com/email/batch")` | **Bulk/Broadcast** (`POSTMARK_BROADCAST_TOKEN`) |
| **Admin CRM Engine** | Mass Newsletters, Targeted Geographic Drops, System Pipelines (like Welcome Series) | Admin UI executing `/functions/v1/send-crm-campaign` | `sendBroadcastEmailBatch(...)` or `sendBroadcastTemplateBatch(...)` | **Bulk/Broadcast** (`POSTMARK_BROADCAST_TOKEN`) |

---

> **Summary Analysis:** 
> The architecture correctly segregates traffic to protect domain stability. Every single 1-to-1 operational message strictly routes via the primary **Transactional IP cluster**. The only two mechanisms allowed to touch the **Dedicated Broadcast IP pool** are the mass `grower_digest` and the `send-crm-campaign` mass marketing engine.
