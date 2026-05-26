# Facebook Auto-Posting Strategy

## Overview

CasaGrown automatically generates Facebook posts for two targets:
1. **CasaGrown's Official Facebook Page** — platform-level marketing (admin-reviewed)
2. **Seller's Own Facebook Page** — individual seller promotion (auto-posted)

---

## Post Types

### Post 1: CasaGrown Daily Listings Digest
| Field | Value |
|-------|-------|
| **Target** | CasaGrown's Facebook Page |
| **Frequency** | 1/day at 8am PT (13:00 UTC) |
| **Trigger** | Cron: `generate-fb-posts` |
| **Flow** | Generated → auto-published via `publishMultiPhotoPost()` → logged to `fb_auto_post_log` |
| **Content** | Aggregates all active products from opted-in Pro sellers, grouped by category |

**Example Post:**
```
🌱 New on CasaGrown today!

Heirloom peppers from 2 growers, sweet corn, fresh eggs, beefsteak tomatoes, sugar snap peas, organic honey, and more!

🆕 New Pro sellers this week:

👩‍🌾 Sam Seller — San Jose, CA
🛒 https://casagrown.com/market/booth/4aa1bb97
📘 https://facebook.com/samsfarmstand

👨‍🌾 Alex Adams — San Jose, CA
🛒 https://casagrown.com/market/booth/6cab0ae0

Browse what's fresh from your neighbors → https://casagrown.com/market
```

**Image:** Multi-photo carousel (up to 6 product photos) via Facebook's `attached_media` API. Each photo uploaded as unpublished, then attached to the feed post.

---

### Post 2: New Seller Welcome
| Field | Value |
|-------|-------|
| **Target** | CasaGrown's Facebook Page |
| **Frequency** | Weekly (at most 1/week, only if new sellers joined) |
| **Trigger** | Cron: `generate-fb-posts` (checks `fb_auto_post_log` for existing welcome this week) |
| **Flow** | Generated → auto-published via `publishMultiPhotoPost()` → logged to `fb_auto_post_log` |
| **Content** | Lists all Pro sellers who activated in the past 7 days |

**Example Post:**
```
🎉 New on CasaGrown this week!

Welcome to our newest local growers:

👩‍🌾 Sam's Farm Stand — San Jose, CA
🛒 Shop: https://casagrown.com/market/booth/abc123
📍 Pickup: 1168 Lincoln Ave, San Jose, CA 95125
🚗 Delivery: 95125, 95126, 95128
📘 Follow: https://facebook.com/samsfarmstand

👨‍🌾 Alex's Fresh Picks — San Jose, CA
🛒 Shop: https://casagrown.com/market/booth/xyz456
📍 Pickup: 1021 Lincoln Ave, San Jose, CA 95125

Support local! 🌱 https://casagrown.com/market
```

**Image:** Multi-photo carousel of seller business logos (or profile avatars). Each seller's logo/avatar uploaded as unpublished photo, then attached to the feed post.

**Data shown per seller:**
- Farm/business name or full name
- City, State
- Booth link on CasaGrown (clickable `https://casagrown.com/market/booth/{id}`)
- Pickup address
- Delivery zip codes (if applicable)
- Facebook page link (clickable `https://facebook.com/{page_id}`)

---

### Post 3: Seller Daily Menu
| Field | Value |
|-------|-------|
| **Target** | Seller's own Facebook Page |
| **Frequency** | 1/day at 8am PT (13:00 UTC) |
| **Trigger** | Cron: `generate-fb-posts` |
| **Flow** | Auto-published via `publishMultiPhotoPost()` → logged to `fb_auto_post_log` |
| **Requires** | Seller has `auto_post_enabled = true` in `seller_fb_connections` |
| **Content** | All active products grouped by booth, with prices, pickup/delivery info |

**Example Post:**
```
🌱 What's fresh today from Sam's Farm Stand!

📍 Willow Glen Farm Stand — 1168 Lincoln Ave, San Jose, CA 95125
  • Heirloom Peppers — $4.50
  • Sweet Corn — $3.00
  • Fresh Eggs — $6.00
  • Organic Honey — $12.00
  🚗 Delivery: 95125, 95126

Order now 👇
https://casagrown.com/market/booth/abc123
```

**Image:** Multi-photo carousel of product photos (one per active product, up to 10). Each product's first photo uploaded as unpublished, then attached to the feed post.

**Links:**
- **Booth link** — `https://casagrown.com/market/booth/{booth_id}` (included in post text)
- If seller has multiple booths, each booth section gets its own link
- Product links are NOT included individually — the booth link serves as the landing page

**What triggers a post:**
- Cron runs daily at 8am PT
- Checks if seller has `auto_post_enabled = true`
- Checks if already posted today (max 1/day via `fb_auto_post_log`)
- Collects ALL active products with `inventory > 0` across all open booths
- If no products found, skips (no empty post)

---

## Architecture

### Cron Schedule
| Cron Job | Schedule | Function | Purpose |
|----------|----------|----------|---------|
| `generate-fb-posts` | Daily 13:00 UTC (6am PT) | `generate-fb-posts` | Generates and auto-publishes all 3 post types |
| `sync-facebook-catalog` | Every 6 hours | `sync-facebook-catalog` | Syncs product catalog to FB Commerce |

### Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│              generate-fb-posts (daily cron)                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Seller Daily Menu ──────► publishMultiPhotoPost() ──► FB   │
│                             Seller's Page                    │
│                                                              │
│  Daily Digest ───────────► publishMultiPhotoPost() ──► FB   │
│                             CasaGrown Page                   │
│                                                              │
│  New Seller Welcome ─────► publishMultiPhotoPost() ──► FB   │
│                             CasaGrown Page                   │
│                                                              │
│  All posts ──────────────► fb_auto_post_log (audit trail)   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Facebook Multi-Photo API Flow

```
For each post with multiple photos:

1. Upload each photo as unpublished:
   POST /{page-id}/photos { url: <photo_url>, published: false }
   → Returns { id: "photo_fbid_1" }

2. Create feed post with all photos:
   POST /{page-id}/feed {
     message: "Post text...",
     attached_media[0]: { media_fbid: "photo_fbid_1" },
     attached_media[1]: { media_fbid: "photo_fbid_2" },
     ...
   }

Facebook renders as native photo grid:
  1 photo  → full width
  2 photos → side by side
  3 photos → 1 large + 2 small
  4 photos → 2×2 grid
  5+ photos → 2×2 + "+N more"
```

### Database Tables

| Table | Purpose |
|-------|---------|
| `fb_auto_post_log` | Audit log of all auto-published posts (seller + CasaGrown) |
| `seller_fb_connections` | Seller FB page connections + opt-in toggles |

### Seller Opt-In Toggles (in `seller_fb_connections`)

| Toggle | Default | Controls |
|--------|---------|----------|
| `auto_sync_enabled` | true | Product catalog sync to FB Commerce |
| `auto_post_enabled` | false | Daily Menu posts to seller's own FB page |
| `casagrown_post_enabled` | false | Allow products to appear in CasaGrown page posts |

---

## Limits

| Limit | Value |
|-------|-------|
| Seller page posts | 1/day per seller |
| CasaGrown digest posts | 1/day |
| CasaGrown welcome posts | 1/week (only if new sellers) |
| Total CasaGrown posts/day | 1-2 max |
