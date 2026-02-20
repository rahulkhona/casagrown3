# CasaGrown — Product Requirements Document (PRD)

**Version**: 1.1\
**Last Updated**: February 20, 2026\
**Platform**: Cross-platform (iOS, Android, Web)\
**Tech Stack**: React Native (Expo) + Tamagui + Supabase + Next.js Admin

---

## 1. Product Overview

**CasaGrown** is a hyperlocal community marketplace that connects homegrowers,
gardeners, and neighbors to buy, sell, and trade homegrown produce, garden
services, and advice. Users join geo-fenced communities based on H3 hexagonal
indexing and interact through posts, real-time chat, and a points-based
incentive system.

### Vision

Enable sustainable, neighborhood-level food sharing by making it effortless to
list, discover, and transact around homegrown produce and garden-related
services.

### Key Differentiators

- **H3-based geo communities**: Automatic community assignment using Uber's H3
  spatial indexing (resolution 7 ≈ 5 km² hexagons)
- **Delegation system**: Users can delegate others to sell produce on their
  behalf
- **Points & rewards**: Gamified incentive system to drive engagement
- **Universal app**: Single codebase for iOS, Android, and Web

---

## 2. User Personas

| Persona              | Description                                                       |
| :------------------- | :---------------------------------------------------------------- |
| **Homegrower**       | Grows produce at home, wants to sell/share surplus with neighbors |
| **Buyer**            | Wants to purchase fresh, local, homegrown produce                 |
| **Service Provider** | Offers gardening services (landscaping, composting, pest control) |
| **Community Member** | Seeks gardening advice, shares "show & tell" updates              |
| **Delegate**         | Manages sales on behalf of less tech-savvy growers                |

---

## 3. Feature Specifications

### 3.1 Authentication & Onboarding

#### 3.1.1 Login / Signup

- Email/password authentication via Supabase Auth
- Auto-profile creation on signup via database trigger (`handle_new_user`)
- Auto-generation of unique 8-character referral code
- Signup points awarded automatically from `incentive_rules`

#### 3.1.2 Profile Wizard (First-time Setup)

Three-step onboarding flow:

| Step | Screen             | Purpose                                                                   |
| :--- | :----------------- | :------------------------------------------------------------------------ |
| 1    | **Profile Setup**  | Full name, avatar (camera or gallery), phone number                       |
| 2    | **Join Community** | Zip code entry → H3 community resolution → interactive map preview → join |
| 3    | **Intro Post**     | Optional first post to introduce yourself to the community                |

- Community resolution uses Supabase Edge Function (`resolve-community`) or
  client-side H3 on web
- Interactive map shows community boundary (Leaflet on web, MapView on native)
- Skippable steps with progress indicator

---

### 3.2 Community & Geography

#### 3.2.1 H3 Community System

- Communities are defined as H3 hexagons at resolution 7
- Each community has: name (OSM-derived), boundary polygon, city/state/country
- Users belong to a **home community** + array of **nearby communities**
- PostGIS spatial indexes for proximity queries

#### 3.2.2 Community Map

- Interactive Leaflet map (web) / MapView (native) showing hexagonal boundaries
- Community name labels with auto-hiding at zoom levels
- Neighboring community visualization

#### 3.2.3 Community Enrichment

- Automated cron job (`enrich-communities`) discovers and names communities
- Uses OSM data for landmark-based naming
- Runs periodically via `pg_cron`

---

### 3.3 Feed & Discovery

#### 3.3.1 Main Feed

- Chronological feed of posts from user's community + nearby communities
- Server-side caching with `feed-cache.ts` for instant renders
- Pull-to-refresh and infinite scroll

#### 3.3.2 Feed Filters

Six filter categories:

| Filter      | Post Types Shown                    |
| :---------- | :---------------------------------- |
| All         | Everything                          |
| For Sale    | `want_to_sell`                      |
| Wanted      | `want_to_buy`                       |
| Services    | `offering_service` + `need_service` |
| Advice      | `seeking_advice`                    |
| Show & Tell | `general_info`                      |

#### 3.3.3 Post Cards

Each post card displays:

- Author avatar, name, community
- Post type badge (color-coded)
- Content text with media carousel (images + videos)
- Like count + comment count
- "Chat" action button to initiate conversation
- Location sharing display

#### 3.3.4 Post Interactions

- **Like/Unlike** — Toggle with instant UI feedback
- **Comments** — Threaded text comments on posts
- **Flag** — Report inappropriate content with reason

#### 3.3.5 Navigation Bar

Bottom navigation with 7 items:

| Tab             | Function              | Badge                     |
| :-------------- | :-------------------- | :------------------------ |
| Feed            | Main feed             | —                         |
| Chats           | Messaging inbox       | Unread conversation count |
| Orders          | Transaction history   | —                         |
| My Posts        | Post management       | —                         |
| Redeem          | Points redemption     | —                         |
| Transfer Points | Send points to others | —                         |
| Delegate Sales  | Manage delegation     | —                         |

---

### 3.4 Post Creation

#### 3.4.1 Post Type Selection

Six post types presented as icon cards:

| Type                 | Form          | Key Fields                                                                         |
| :------------------- | :------------ | :--------------------------------------------------------------------------------- |
| **Want to Sell**     | `SellForm`    | Category, produce name, quantity, unit, price, delivery dates, need-by date, media |
| **Want to Buy**      | `BuyForm`     | Category, produce names (multi-select), need-by date                               |
| **Need Service**     | `GeneralForm` | Content, media                                                                     |
| **Offering Service** | `GeneralForm` | Content, media                                                                     |
| **Seeking Advice**   | `GeneralForm` | Content, media                                                                     |
| **Show & Tell**      | `GeneralForm` | Content, media                                                                     |

#### 3.4.2 Sell Form Details

- **Category picker**: Fruits, Vegetables, Herbs, Flowers, Flower Arrangements,
  Garden Equipment, Pots, Soil
- **Unit of measure**: Piece, Dozen, Box, Bag
- **Delivery dates**: Multiple selectable delivery dates
- **Need-by date**: Latest acceptable drop-off date
- **On-behalf-of**: Optional delegation (sell for another user)
- **Post reach**: Community-only or Global visibility

#### 3.4.3 Media Attachments

- Photo selection from library (iOS/Android/Web)
- Camera capture (direct photo/video, all platforms)
- Web camera modal with preview
- **Image compression**: Automatic resizing + quality optimization for upload
- **Video compression**: Platform-aware compression (FFmpeg on iOS/Android,
  browser-native on web)
- Media stored in Supabase Storage with signed URLs

#### 3.4.4 Edit & Clone

- **Edit**: Modify existing post (navigates with `editId`)
- **Clone**: Duplicate post data into new form (navigates with `cloneData` JSON)

---

### 3.5 My Posts Management

#### 3.5.1 Post List

- Grid/list of user's posts with type/status badges
- Active vs. expired status based on configurable `post_type_policies`
  expiration days

#### 3.5.2 Filters & Sorting

| Filter     | Options                                         |
| :--------- | :---------------------------------------------- |
| **Type**   | All, Selling, Buying, Services, Advice, General |
| **Status** | All, Active, Expired                            |
| **Owner**  | All, Mine, Delegate                             |
| **Sort**   | Newest first, Oldest first                      |

#### 3.5.3 Post Actions

- **View** — Navigate to post detail page
- **Edit** — Open edit form with pre-filled data
- **Repost** — Reset `created_at` to make an expired post active again
- **Clone** — Create a new post with copied data
- **Delete** — Remove post with confirmation

---

### 3.6 Chat & Messaging

#### 3.6.1 Conversation Model

- Conversations are tied to a specific **post** + **buyer** + **seller**
- Auto-created on first message via `getOrCreateConversation`
- Duplicate-safe upsert with unique constraint on
  `(post_id, buyer_id, seller_id)`

#### 3.6.2 Chat Inbox (`ChatInboxScreen`)

- List of all conversations sorted by **unread-first**, then by recency
- Each row shows: other user's avatar, name, last message preview, timestamp
- **Unread indicators**: Green dot + count badge on unread conversations
- **Post type badge**: Color-coded indicator of the associated post type
- **Deduplication**: Groups conversations by `(post_id, other_user_id)` to
  prevent duplicates
- **Dynamic nav badge**: Unread chat count shown on "Chats" navigation item,
  refreshed on focus

#### 3.6.3 Chat Screen (`ChatScreen`)

- Bubbled message layout (sender right, receiver left)
- Date dividers between message groups
- Auto-scroll to newest messages
- Keyboard-aware scroll behavior (mobile)

**Message types**:

| Type     | Display                      |
| :------- | :--------------------------- |
| `text`   | Text bubble                  |
| `media`  | Image/video with playback    |
| `mixed`  | Text + media attachment      |
| `system` | Centered system notification |

**Shared location**: Location messages display inline with map preview

#### 3.6.4 Chat Post Card (`ChatPostCard`)

Displayed at the top of each conversation to show the post context:

- **Sell posts**: Product name, available quantity, price per unit, delivery
  dates
- **Buy posts**: Localized details — desired quantity (`feed.desiredQty`),
  need-by date (`feed.needBy`), available delivery dates (`feed.deliveryDates`)
- All strings are localized via `react-i18next`

#### 3.6.5 Offer & Order Actions in Chat

- **Seller on buy posts**: "Make Offer" button opens `OfferSheet` (quantity,
  price, delivery dates, message, media)
- **Buyer on sell posts**: "Order" button opens `OrderSheet` (quantity, delivery
  date, address, instructions)
- **Buyer reviewing offers**: Accept → `AcceptOfferSheet` (delivery address,
  partial quantity), Reject → `reject_offer_with_message` RPC
- **Seller managing offers**: Modify → `OfferSheet` (edit mode), Withdraw →
  `withdraw_offer_with_message` RPC
- **Seller managing orders**: Accept Order, Reject Order buttons (versioned RPCs
  with optimistic locking)
- **Buyer managing orders**: Cancel, Confirm Delivery, Dispute buttons
- Order completion triggers role-specific system messages via `visible_to`
  metadata

#### 3.6.6 Delivery & Read Receipts

- **Sent**: Single grey checkmark (✓)
- **Delivered**: Double grey checkmarks (✓✓) — set when recipient's device
  receives
- **Read**: Double blue checkmarks (✓✓) — set when recipient views the
  conversation
- Database columns: `delivered_at`, `read_at` on `chat_messages`
- Realtime UPDATE subscription for live status changes

#### 3.6.7 Presence & Typing Indicators

Hybrid architecture for reliability:

| Feature              | Technology         | Behavior                                              |
| :------------------- | :----------------- | :---------------------------------------------------- |
| **Online status**    | Supabase Presence  | Green dot on avatar when user is in the chat          |
| **Typing indicator** | Supabase Broadcast | Animated dots ("..." pulse) when other user is typing |

- `createPresenceChannel` manages both via a single Supabase Realtime channel
- Own typing events are filtered out client-side
- Leave events immediately clear both online and typing state

#### 3.6.8 Media in Chat

- Send photos/videos within chat messages
- Camera capture + gallery selection
- Media uploaded to Supabase Storage with compression
- Inline preview with full-screen viewer

---

### 3.7 Delegation System

#### 3.7.1 Concept

A **delegator** (typically less tech-savvy grower) can authorize a **delegate**
(typically a neighbor or family member) to create and manage sales posts on
their behalf.

#### 3.7.2 Delegation Flow

```
Delegator creates delegation link → Delegate joins via code →
System pairs them → Delegator accepts → Delegate can post on their behalf
```

#### 3.7.3 Delegation States

| Status            | Meaning                                        |
| :---------------- | :--------------------------------------------- |
| `pending_pairing` | Link created, waiting for delegate to join     |
| `pending`         | Delegate joined, awaiting delegator acceptance |
| `accepted`        | Active delegation — delegate can create posts  |
| `active`          | Delegation is currently active with posts      |
| `inactive`        | Temporarily disabled                           |
| `rejected`        | Delegator rejected the request                 |
| `revoked`         | Delegator revoked an active delegation         |

#### 3.7.4 Delegate Screen

- **"My Delegates" tab**: List of people delegating for you (add via code,
  revoke)
- **"Delegating For" tab**: List of people you're delegating to
  (accept/reject/inactivate)
- Add delegate via bottom sheet: Enter referral code or share QR link
- Status badges on each delegation card

---

### 3.8 User Profiles

#### 3.8.1 Profile Screen

- **View mode**: Avatar, full name, community info, activity stats, notification
  preferences
- **Edit mode**: Inline editing with save/cancel
- Avatar upload via camera or gallery with compression
- Community map showing home hexagon

#### 3.8.2 Activity Stats

| Stat         | Source                      |
| :----------- | :-------------------------- |
| Transactions | Completed order count       |
| Rating       | Average buyer/seller rating |
| Posts        | Total post count            |
| Following    | Follower count              |

#### 3.8.3 Notification Preferences

- **Push notifications**: Enable/disable
- **SMS notifications**: Enable/disable
- **Wanted alerts**: Notify when someone wants what you grow
- **Available alerts**: Notify when produce you want is available

#### 3.8.4 User Detail Screen

- Public profile view for other users
- Shows their posts, activity stats, community

---

### 3.9 Points & Incentive System

#### 3.9.1 Earning Points

| Action                      | Points       | Scope         |
| :-------------------------- | :----------- | :------------ |
| Sign up                     | Configurable | Global        |
| Complete basic profile      | Configurable | Global        |
| Join a community            | Configurable | Global        |
| Make first post             | Configurable | Global        |
| Invite to community         | Configurable | Per community |
| Invitee signs up            | Configurable | Global        |
| Invitee's first transaction | Configurable | Global        |
| First transaction           | Configurable | Global        |

- Points are configurable per geographic scope (global → country → state → city
  → zip → community)
- Idempotent: duplicate reward attempts are prevented via metadata check

#### 3.9.2 Point Ledger

Full audit trail of all point transactions:

- `reward` — Earned from incentive actions
- `purchase` — Buying items
- `payment` — Received from sales
- `platform_charge` — Platform fee deduction
- `transfer` — User-to-user point transfer
- `redemption` — Spending points on rewards

#### 3.9.3 Referral System

- Each user gets a unique 8-character referral code
- Inviter ↔ invitee linked via `invited_by_id`
- Auto-follow relationship created on referral signup
- Points awarded to both parties at milestones

---

### 3.10 Redemption System

#### 3.10.1 Redemption Catalog

- Items available for point redemption: gift cards, merchandise, donations
- Each item has: name, description, point cost, media, active status
- Geographic reach restrictions (global or restricted to specific areas)

#### 3.10.2 Redemption Flow

- User browses catalog → selects item → confirms redemption
- Points deducted from balance → redemption record created
- Status tracking: `pending` → `completed` / `failed`

---

### 3.11 Transaction System

The transaction system supports two distinct flows depending on the post type:

- **Sell posts** (`want_to_sell`): Buyer places an order directly
- **Buy posts** (`want_to_buy`): Seller makes an offer, buyer accepts/rejects →
  order created on acceptance

#### 3.11.1 Sell-Post Order Flow

```
Buyer sees sell post → Opens chat → Taps "Order" →
OrderSheet (qty, date, address) → create-order edge function →
Order created (pending) + Points escrowed → Seller accepts/rejects
```

- Buyer specifies: quantity, delivery date, delivery address, instructions
- Points are escrowed immediately via `create-order` edge function
- Order is created in `pending` status
- Seller reviews and accepts (via `accept_order_versioned`) or rejects

#### 3.11.2 Buy-Post Offer Flow

```
Seller sees buy post → Opens chat → Taps "Make Offer" →
OfferSheet (product, qty, price, dates, media) → create_offer_atomic RPC →
Offer created (pending) → Buyer reviews →
Accept (AcceptOfferSheet: address, partial qty) / Reject / Wait
```

- Seller specifies: category, product, quantity, points per unit, delivery
  dates, message, media attachments, optional link to their own sell post
- Offer created via `create_offer_atomic` SQL RPC
- Buyer reviews offer in chat and can:
  - **Accept** → `accept_offer_atomic` creates order + escrows points (buyer can
    specify partial quantity and delivery address)
  - **Reject** → `reject_offer_with_message` (system message)
- Seller can **Modify** (bump version) or **Withdraw** a pending offer

#### 3.11.3 Offer Lifecycle

| Status      | Description                                      |
| :---------- | :----------------------------------------------- |
| `pending`   | Offer submitted, awaiting buyer response         |
| `accepted`  | Buyer accepted → order created                   |
| `rejected`  | Buyer declined the offer                         |
| `withdrawn` | Seller withdrew the offer before buyer responded |

**Offer RPCs** (all SQL RPC with `SECURITY DEFINER`):

| RPC                           | Actor  | Effect                                                |
| :---------------------------- | :----- | :---------------------------------------------------- |
| `create_offer_atomic`         | Seller | Creates conversation + offer + seller chat message    |
| `accept_offer_atomic`         | Buyer  | Accepts offer, creates order, escrows points          |
| `reject_offer_with_message`   | Buyer  | Rejects offer, system message                         |
| `withdraw_offer_with_message` | Seller | Withdraws pending offer, system message               |
| `modify_offer_with_message`   | Seller | Modifies pending offer, bumps version, seller message |

#### 3.11.4 Order Lifecycle

| Status      | Description                                                         |
| :---------- | :------------------------------------------------------------------ |
| `pending`   | Order placed by buyer. Points escrowed. Awaiting seller acceptance. |
| `accepted`  | Seller accepted. Delivery expected.                                 |
| `delivered` | Seller marked delivered. Buyer confirms or auto-confirms.           |
| `disputed`  | Buyer raised a dispute. Escalation flow begins.                     |
| `cancelled` | Order cancelled. Points refunded.                                   |

Full order lifecycle details documented in
[order_lifecycle.md](order_lifecycle.md).

**Order RPCs** (all SQL RPC with `SECURITY DEFINER` + `FOR UPDATE` locking):

| RPC                         | Actor  | Effect                                           |
| :-------------------------- | :----- | :----------------------------------------------- |
| `accept_order_versioned`    | Seller | Accepts with version check, reduces quantity     |
| `reject_order_versioned`    | Seller | Declines, refunds buyer                          |
| `cancel_order_with_message` | Either | Cancel + refund + system message                 |
| `mark_delivered`            | Seller | Marks delivered with proof (URL, geo, timestamp) |
| `confirm_order_delivery`    | Buyer  | Confirms receipt, releases escrow minus fees     |
| `modify_order`              | Buyer  | Modifies pending order, bumps version            |

#### 3.11.5 Orders Screen

- **Buying tab** — Orders where user is the buyer
- **Selling tab** — Orders where user is the seller
- Each order card shows: product name, category, quantity, price, other party
  name, status badge, delivery date
- Tap order → navigates to conversation
- Status-aware action buttons in chat

#### 3.11.6 Ratings & Reviews

- Mutual ratings: buyer rates seller AND seller rates buyer
- 1–5 star scale with optional text feedback

#### 3.11.7 Disputes & Escalations

- Either party can escalate an order
- Escalation includes: reason, proof media
- Resolution types: refund accepted, resolved without refund, dismissed
- Refund offers can be made with amounts and messages
- Role-specific system messages: buyer sees refund details, seller sees payout
  details (via `visible_to` metadata)

#### 3.11.8 Point Escrow Model

- Points are **never transferred directly** between buyer and seller
- Buyer's points are escrowed at order creation (type=`escrow`)
- On completion: seller receives payment minus platform fee (type=`payment` +
  type=`platform_fee`)
- On cancellation or dispute refund: buyer receives refund (type=`refund`)

#### 3.11.9 Platform Fees

- Configurable platform fee percentage (default: 10%)
- Stored in `platform_config` table (database-driven, not hardcoded)

---

### 3.12 Internationalization (i18n)

- Full i18n support via `react-i18next`
- All user-facing strings stored in translation files
- Translation keys organized by feature area (e.g., `feed.*`, `createPost.*`,
  `myPosts.*`)

---

### 3.13 Media Handling

#### 3.13.1 Upload Pipeline

1. User selects/captures media
2. Client-side compression (image resize + quality, video transcode)
3. Upload to Supabase Storage bucket
4. `media_assets` record created with `storage_path` and `media_type`
5. Signed URL generated for display

#### 3.13.2 Platform-Specific Handling

- **iOS**: Native image picker + camera, FFmpeg video compression
- **Android**: Native image picker + camera, FFmpeg video compression
- **Web**: File input + WebCameraModal, browser-native compression
- **Video playback**: Inline with platform controls, WebM fallback opens in
  browser on iOS

---

## 4. Technical Architecture

### 4.1 Monorepo Structure

```
casagrown3/
├── apps/
│   ├── expo-community/     # Main Expo app (iOS, Android, Web)
│   └── next-admin/         # Admin dashboard (Next.js)
├── packages/
│   └── app/                # Shared app code (features, utils, design tokens)
├── supabase/
│   ├── migrations/         # 27 database migrations
│   ├── functions/          # 6 Edge Functions
│   └── seed.sql            # Development seed data
└── docs/                   # Documentation
```

### 4.2 Backend (Supabase)

| Service            | Usage                                               |
| :----------------- | :-------------------------------------------------- |
| **Postgres**       | Primary database with 30+ tables, RLS, triggers     |
| **Auth**           | Email/password authentication                       |
| **Storage**        | Media files (images, videos, avatars)               |
| **Realtime**       | Live chat messages, delivery receipts, presence     |
| **Edge Functions** | Community, delegation, payments, orders, enrichment |
| **PostGIS**        | Spatial queries for community proximity             |
| **pg_cron**        | Scheduled community enrichment jobs                 |

### 4.3 Edge Functions

| Function                   | Purpose                                             |
| :------------------------- | :-------------------------------------------------- |
| `resolve-community`        | Resolve H3 index from coordinates/zip code          |
| `enrich-communities`       | Auto-name communities from OSM data                 |
| `pair-delegation`          | Match delegates with delegators via code            |
| `assign-experiment`        | A/B test experiment assignment                      |
| `sync-locations`           | Synchronize location data                           |
| `update-zip-codes`         | Refresh zip code reference data                     |
| `create-payment-intent`    | Create payment transaction + Stripe PaymentIntent   |
| `confirm-payment`          | Idempotent point crediting (single source of truth) |
| `stripe-webhook`           | Handle Stripe webhook events (signature verified)   |
| `resolve-pending-payments` | Recover stuck payments on app open                  |
| `create-order`             | Atomic order creation with point debit/credit       |

### 4.4 Database Migrations

72 sequential migrations covering: schema, RLS policies, triggers, indexes,
enums, realtime configuration, payment transactions, offer lifecycle, and order
management. Full migration list documented in `data_model.md`.

### 4.5 Row-Level Security (RLS)

Comprehensive RLS policies on all tables ensuring:

- Users can only read their own conversations/messages
- Posts are publicly readable, but only authors can modify
- Follower relationships are user-controlled
- Point ledger entries are scoped to the user
- Anonymous read access for public content (post sharing)

---

## 5. Quality & Testing

### 5.1 Test Suite

| Layer              | Suites/Flows |   Tests | Status      |
| :----------------- | -----------: | ------: | :---------- |
| **Jest (Unit)**    |           37 |     549 | ✅ All pass |
| **Playwright E2E** |           14 |     206 | ✅ All pass |
| **Maestro E2E**    |           12 |      12 | ✅ All pass |
| **Total**          |       **63** | **767** | ✅ All pass |

### 5.2 Git Hooks

| Hook           | Action                                                     |
| :------------- | :--------------------------------------------------------- |
| **Pre-commit** | `lint-staged` → `jest --findRelatedTests` on changed files |
| **Pre-push**   | Full Jest suite with `--bail` (fail fast)                  |

---

## 6. Development Setup

All development runs **locally** — no internet required after initial setup:

- Supabase stack in Docker (Postgres, Auth, Storage, Realtime)
- Expo dev server with Metro bundler
- Local seed data for development

See [Developer Guide](developer_guide.md) for setup instructions.

---

## 7. Designed but Not Yet Implemented (from Figma Prototype)

> The following features are fully designed in the Figma prototype
> (`figma_code/src/components/`) with complete UI mockups. Database schemas
> exist for most. These are the remaining features needed to complete the
> product.

---

### 7.1 Post Detail Screen

**Figma**: `PostDetail.tsx` (2,294 lines)\
**Status**: ❌ Not implemented — no `detail-screen` in app features

Full post detail page with transactional capabilities:

- **Post header**: Author info, community, post age, share/flag/like buttons
- **Media gallery**: Full-width image/video carousel
- **Sell post details**: Category, quantity, price, available delivery dates
- **Drop-off request modal**: Buyer specifies quantity, delivery address, latest
  date, preferred dates
- **Offer/counter-offer flow**: Buyer proposes price → seller accepts/rejects
- **Checkout flow**: Points-based payment with cost breakdown (subtotal +
  platform fee)
- **Buy Points inline**: If insufficient points, purchase more during checkout
- **Payment processing fees**:
  - Credit card: 3% processing fee
  - ACH/bank transfer: $1.00 flat fee
- **Comments section**: View and add comments below the post
- **"Chat with Seller" button**: Opens chat from post context
- **Related posts**: "Posts from this seller" section at bottom

---

### 7.2 ~~Orders & Transaction Management~~ → Implemented ✅

> [!NOTE]
> Orders, offers, and transaction management are **fully implemented**. See
> **Section 3.11** for complete documentation of the offer + order lifecycle,
> including both sell-post and buy-post flows, with 11 SQL RPC functions, point
> escrow, and the Orders screen UI.

---

### 7.3 Redemption Store

**Figma**: `RedemptionStore.tsx` (379 lines)\
**Status**: ❌ Navigation placeholder exists, no UI implementation\
**DB**: Schema complete (`redemption_merchandize`,
`redemption_merchandize_media`, `redemption_orders`)

#### 7.3.1 Store Layout

- **Points balance** banner at top
- **Search** bar to filter items
- **Category tabs**: All, Retail, Food & Drink, Charity
- **Grid of cards**: Image, name, point cost, "Redeem" button

#### 7.3.2 Catalog Items

Three item types:

| Type                  | Examples                               |
| :-------------------- | :------------------------------------- |
| **Gift Cards**        | Amazon, Target, Starbucks, Whole Foods |
| **Food & Drink**      | Restaurant gift cards                  |
| **Charity Donations** | Feeding America, local food bank       |

#### 7.3.3 Redemption Flow

1. User taps "Redeem" on card
2. Confirmation dialog: item name, cost, remaining balance preview
3. Points deducted → success animation
4. Record saved to `redemption_orders`

#### 7.3.4 Transaction History

- "History" tab showing past redemptions with date, type, name, points spent

---

### 7.4 Transfer Points

**Figma**: `TransferPoints.tsx` (306 lines)\
**Status**: ❌ Navigation placeholder exists, no UI implementation\
**DB**: Point ledger supports `transfer` type

#### 7.4.1 Transfer Flow

1. **Recipient search**: Search community members by name/email
2. **Select recipient**: Tap to select from filtered list
3. **Enter amount**: Point amount with current balance display
4. **Review & confirm**: Summary showing sender, recipient, amount, new balance
5. **Success state**: Confirmation with checkmark animation

#### 7.4.2 Community Member List

- Shows name, email, community, avatar
- Filtered by search query
- Only members from user's communities visible

---

### 7.5 Buy Points

**Figma**: `BuyPoints.tsx` (548 lines), `BuyPointsModal.tsx` (392 lines)\
**Status**: ✅ Partially implemented (mock provider complete, Stripe UI
pending)\
**DB**: `point_ledger` + `payment_transactions` tables

#### 7.5.1 Point Packages

| Package    | Points | Price |
| :--------- | -----: | ----: |
| Starter    |    100 |   $10 |
| Popular    |    250 |   $25 |
| Best Value |    500 |   $45 |
| Premium    |  1,000 |   $80 |

Custom amount option also available.

#### 7.5.2 Payment Methods

- **Credit/Debit Card**: 3% processing fee
- **ACH/Bank Transfer**: $1.00 flat fee

#### 7.5.3 Payment Architecture (Implemented)

- **Provider pattern**: Swappable mock/Stripe via `PAYMENT_MODE` env var
- **Server-side confirmation**: All point crediting happens via
  `confirm-payment` edge function (single source of truth)
- **Payment transactions**: Tracked in `payment_transactions` table with
  idempotent confirmation
- **Pending recovery**: `resolve-pending-payments` edge function +
  `usePendingPayments` hook recover stuck transactions on app open
- **Webhook-based**: Stripe webhooks trigger `confirm-payment` for reliable
  server-side processing even if app closes during payment

#### 7.5.4 Remaining Work for Production

- Replace mock `TextInput` card fields with Stripe Elements
  (`@stripe/react-stripe-js` web, `@stripe/stripe-react-native` native)
- Finish `stripePaymentService.ts` `confirmPayment()` (~15 lines)
- Configure Stripe Dashboard webhook endpoint
- Set production env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)

---

### 7.6 Notifications Center

**Figma**: `NotificationsPage.tsx` (297 lines)\
**Status**: ❌ Not implemented\
**DB**: No `notifications` table yet (needs migration)

#### 7.6.1 Notification Types

| Type                        | Icon         | Description                            |
| :-------------------------- | :----------- | :------------------------------------- |
| `buy-request`               | ShoppingCart | Someone requested to buy your item     |
| `offer`                     | Tag          | New offer on your post                 |
| `follow`                    | UserPlus     | New follower                           |
| `following-post`            | Heart        | Someone you follow posted              |
| `flag-update`               | AlertCircle  | Your flagged post update               |
| `delegate-sale-created`     | —            | Delegate created a sale on your behalf |
| `delegate-sale-completed`   | CheckCircle  | Delegated sale completed               |
| `delegate-request-accepted` | UserPlus     | Delegation request accepted            |
| `delegation-revoked`        | UserMinus    | Delegation was revoked                 |
| `delegation-inactivated`    | UserX        | Delegation was inactivated             |
| `account-deactivated`       | AlertCircle  | Account deactivation notice            |

#### 7.6.2 Notification UI

- List view with icon, title, message, timestamp, read/unread dot
- "Mark all as read" button
- Individual dismiss (X button)
- Tap to navigate to related post/order/conversation

---

### 7.7 Following Page

**Figma**: `FollowingPage.tsx` (261 lines)\
**Status**: ❌ Not implemented\
**DB**: `followers` table exists

#### 7.7.1 Followed User Cards

Each card shows:

- Avatar, name, bio, location, rating, total reviews
- Specialties (tags)
- Community membership
- "Member since" duration
- Intro post preview (title + excerpt)
- "View Posts" and "Unfollow" actions

---

### 7.8 User Search & Discovery

**Figma**: `UserSearchPage.tsx` (505 lines)\
**Status**: ❌ Not implemented\
**DB**: `profiles` table supports queries

#### 7.8.1 Search

- Text search by name
- Category filters: All, Growers, Service Providers, Community Members

#### 7.8.2 User Cards

- Avatar, name, bio, rating, review count
- Community tags, specialties
- Total posts, total transactions
- Follow/unfollow toggle button

#### 7.8.3 Stats

- User count per category shown in filter bar

---

### 7.9 Share the Movement

**Figma**: `ShareMovement.tsx` (241 lines)\
**Status**: ❌ Not implemented (appears in onboarding wizard after profile
setup)

#### 7.9.1 Referral Sharing

- Shows earned points for completing profile/posting
- **Copy invite link** — Copies referral URL to clipboard
- **Native share** — Opens system share sheet with pre-formatted message
- "Skip" and "Continue to Feed" actions

---

### 7.10 Landing Page (Public)

**Figma**: `LandingPage.tsx` (327 lines)\
**Status**: ❌ Not implemented

Public marketing page for unauthenticated visitors:

- Hero section with value proposition + hero image
- Feature highlights (reduce waste, feed neighbors, earn rewards)
- How it works (3-step process)
- "Get Started" CTA → routes to signup

---

### 7.11 Admin Dashboard

**Figma**: `admin/` directory (6 components)\
**Status**: Next.js admin app exists at `apps/next-admin/`, but Figma-designed
admin features are not yet ported.\
**DB**: All supporting tables exist

| Admin Screen               | Purpose                                                     |
| :------------------------- | :---------------------------------------------------------- |
| **Dashboard**              | Overview stats (users, posts, transactions, revenue)        |
| **Flagged Posts**          | Review and moderate flagged content (remove, dismiss, warn) |
| **Category Deny List**     | Enable/disable sales categories per geographic scope        |
| **Platform Fees**          | Configure platform fee percentage                           |
| **Redemption Store Admin** | Manage redemption catalog (add/edit/deactivate items)       |
| **Rewards Config**         | Configure incentive point values per action                 |

---

### 7.12 Other Pending Work

| Feature                | Notes                                                                                |
| :--------------------- | :----------------------------------------------------------------------------------- |
| **A/B Testing**        | `experiments` + `experiment_assignments` tables + Edge Function exist                |
| **Push Notifications** | Profile preferences ready, delivery mechanism TBD                                    |
| **Feedback System**    | `feedback` table with `feature_request`/`bug_report` types, admin review UI needed   |
| **User Posts Page**    | Public-facing page showing all posts by a specific user (Figma: `UserPostsPage.tsx`) |
| **Address Input**      | Autocomplete address component for delivery addresses (Figma: `AddressInput.tsx`)    |
