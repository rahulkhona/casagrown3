# CasaGrown Market App — Product Requirements Document

## Purpose

This PRD serves as the single source of truth for all screens, features, and expected behaviors in the market web app (`apps/next-market`). It can be used to:
1. **Validate production deployments** — bots can verify every page renders and key elements exist
2. **Prevent regressions** — any refactor must preserve all listed functionality
3. **Onboard developers** — comprehensive map of the entire app

---

## Screen Integrity Tracking Strategy

### 1. Route Manifest Test
Create a test that enumerates all expected routes and verifies they resolve:
```
/market, /market/booth/:id, /market/booth/:id/product/:productId,
/market/booth/:id/about, /orders, /orders/:id, /earnings,
/earnings/payout, /earnings/tax-info,
/my-booth, /my-booth/products, /my-booth/products/new,
/my-booth/products/:id, /my-booth/orders, /my-booth/coupons,
/my-booth/customize, /my-booth/invitations, /chat, /chat/:id,
/community, /following, /notifications, /get-started, /get-started/:template,
/join-booth/:code, /helping, /login, /profile, /profile-setup,
/settings, /terms, /voice/board, /voice/submit, /voice/ticket, /
```

### 2. Component Import Checklist
Every page should import its expected components. A test can verify:
```
earnings/page.tsx → NotificationBanner
orders/[id]/page.tsx → NotificationBanner, NotificationPromptModal, OrderChat
my-booth/page.tsx → NotificationBanner
community/ClientPage.tsx → NotificationPromptModal
join-booth/[code]/page.tsx → NotificationPromptModal
booth/[id]/page.tsx → NotificationPromptModal
product/[productId]/page.tsx → NotificationPromptModal
products/new/page.tsx → NotificationPromptModal
```

### 3. File Existence Guard
A pre-commit hook or CI check that verifies critical files exist:
```
lib/useNotificationPrompt.ts
app/components/NotificationPromptModal.tsx
app/components/NotificationBanner.tsx
app/components/NotificationPrompt.module.css
app/components/MarketClosedBox.tsx
app/components/BuyModal.tsx
app/components/Navbar.tsx
app/components/BottomNav.tsx
```

### 4. Git Diff Guard
CI check: if any `page.tsx` file loses >30% of its lines in a single commit, flag for manual review.

---

## Shared Components (14)

| Component | File | Used By | Purpose |
|-----------|------|---------|---------|
| Navbar | `app/components/Navbar.tsx` | Layout | App header, hamburger menu, logo |
| BottomNav | `app/components/BottomNav.tsx` | Layout | Mobile bottom tabs: Market, Booth, Orders, Earnings, Chat |
| BuyModal | `app/components/BuyModal.tsx` | Booth, Product | Order checkout sheet with quantity, fulfillment, market-hours enforcement |
| MarketClosedBox | `app/components/MarketClosedBox.tsx` | Market | Full-page closed takeover: countdown, CTAs, reminder, How It Works |
| MarketReceiptSheet | `app/components/MarketReceiptSheet.tsx` | Earnings, Orders | Print-ready receipt overlay |
| NotificationBanner | `app/components/NotificationBanner.tsx` | Earnings, My Booth, Orders | Persistent push-permission banner |
| NotificationPromptModal | `app/components/NotificationPromptModal.tsx` | Multiple pages | 4-variant push permission modal |
| ProductQA | `app/components/ProductQA.tsx` | Product page | Q&A thread on product listing |
| FlagModal | `app/components/FlagModal.tsx` | Product, Booth | Community flagging form |
| RatingReminder | `app/components/RatingReminder.tsx` | Layout | "Rate your order" nudge |
| AnalyticsTracker | `app/components/AnalyticsTracker.tsx` | Layout | Page view + interaction logging |
| OrderChat | `components/OrderChat.tsx` | orders/[id] | Order-specific chat panel |
| CameraCapture | `components/CameraCapture.tsx` | Orders, Products | Photo/video capture with metadata |
| ImageCropper | `components/ImageCropper.tsx` | Products, Profile | Avatar/photo crop tool |

---

## All Screens by Feature Area (35 Pages)

---

### 1. Landing & Authentication

#### `/` — Home / Landing (181 lines)
- **Route**: `app/(main)/page.tsx`
- **Key Elements**: Hero banner, value proposition, CTA to browse market, sign-up prompt
- **Auth**: Public
- **Validation**: Page renders, "Browse Market" link present, CTA visible

#### `/login` — Login (196 lines)
- **Route**: `app/(main)/login/page.tsx`
- **Key Elements**: Email input, OTP verification, redirect support (`?redirect=`)
- **Auth**: Public
- **Validation**: Email input visible, submit button works, redirect param handled

#### `/profile-setup` — Profile Setup Wizard (342 lines)
- **Route**: `app/(main)/profile-setup/page.tsx`
- **Key Elements**: Multi-step form: name, avatar, address, zip code, state
- **Auth**: Required
- **Validation**: All form fields render, step progression works

#### `/get-started` — Seller Onboarding (144 lines)
- **Route**: `app/(main)/get-started/page.tsx`
- **Key Elements**: Template picker cards for booth setup
- **Auth**: Required
- **Validation**: Template cards visible with icons

#### `/get-started/:template` — Booth Setup from Template (535 lines)
- **Route**: `app/(main)/get-started/[template]/page.tsx`
- **Key Elements**: Booth name, theme picker, product seeding, preview
- **Auth**: Required
- **Validation**: Theme picker renders, booth creation works
- **🔔 Push Prompt**: After booth creation

---

### 2. Browse Market

#### `/market` — Browse Market (443 lines)
- **Route**: `app/(main)/market/page.tsx`
- **Key Elements**: 
  - **Open**: Category tabs, product grid, search, address input, seller avatars
  - **Closed**: `MarketClosedBox` full-page — countdown, 3 CTAs (Browse Menu, Find Neighbors, Join Community), Remind Me, How It Works
- **Auth**: Public
- **Validation**: 
  - Open: Product cards render with images, prices, seller names
  - Closed: Countdown visible, all 4 info cards present, Remind Me functional
- **🔔 Push Prompt**: Via MarketClosedBox "Remind Me" panel

#### `/market/booth/:id` — Booth View (330 lines)
- **Route**: `app/(main)/market/booth/[id]/page.tsx`
- **Key Elements**: Booth header image, seller name/bio, product grid, follow button, `BuyModal`
- **Auth**: Public (buy requires auth)
- **Validation**: Header image, product cards, buy button present
- **🔔 Push Prompt**: After successful purchase via `showPrompt()`

#### `/market/booth/:id/product/:productId` — Product Detail (252 lines)
- **Route**: `app/(main)/market/booth/[id]/product/[productId]/page.tsx`
- **Key Elements**: Product image gallery, description, price, Q&A, flag, `BuyModal`
- **Auth**: Public (buy requires auth)
- **Validation**: Image carousel, price display, buy button, Q&A section
- **🔔 Push Prompt**: After successful purchase via `showPrompt()`

#### `/market/booth/:id/about` — Booth About (29 lines)
- **Route**: `app/(main)/market/booth/[id]/about/page.tsx`
- **Key Elements**: Seller bio, location, ratings
- **Auth**: Public

---

### 3. Orders

#### `/orders` — Order List (287 lines)
- **Route**: `app/(main)/orders/page.tsx`
- **Key Elements**: Tab bar (Active, Completed, Disputed), order cards with status pills, buyer/seller role tags
- **Auth**: Required
- **Validation**: Tabs render, order cards show product name/status/price

#### `/orders/:id` — Order Detail (1143 lines)
- **Route**: `app/(main)/orders/[id]/page.tsx`
- **Key Elements**:
  - Summary card: product, buyer/seller, price breakdown, fee, payout
  - Status section: countdown timer, delivery proof photos
  - Actions: mark delivered, confirm receipt, decline, navigate
  - Dispute flow: type picker, reason, photo evidence, quantity mismatch input
  - Order chat (via `OrderChat` component)
  - Refund flow (seller): full/partial refund offer
  - Buyer: accept refund, resolve dispute
  - Passcode exchange for pickups
  - Delivery proof camera capture
- **Auth**: Required (buyer, seller, or helper)
- **Validation**: Summary card renders, action buttons match order status, chat panel opens
- **🔔 NotificationBanner**: "order updates and messages"
- **🔔 Push Prompt**: After sending order chat message, after raising dispute

---

### 4. Earnings & Finance

#### `/earnings` — Earnings & Activity (664 lines)
- **Route**: `app/(main)/earnings/page.tsx`
- **Key Elements**:
  - Summary cards: Available, Unsettled, Held, Total Sales, Purchases, CC Charges, Grocery Savings
  - Date filter: This Month, YTD, All Time, Custom
  - Tabs: Activity, Unsettled, Summary
  - 1099 threshold tracker with progress bar
  - Star rating on completed transactions
  - Clickable receipt for sale/purchase rows
- **Auth**: Required
- **Validation**: Summary cards show values, date filters work, tabs switch content
- **🔔 NotificationBanner**: "payout updates and order alerts"

#### `/earnings/payout` — Payout Options (1012 lines)
- **Route**: `app/(main)/earnings/payout/page.tsx`
- **Key Elements**: PayPal, gift card, donation payout options; threshold rules; auto-payout toggle
- **Auth**: Required
- **Validation**: Available balance shown, payout method cards render

#### `/earnings/tax-info` — Tax Info (73 lines)
- **Route**: `app/(main)/earnings/tax-info/page.tsx`
- **Key Elements**: 1099 reporting info, state thresholds
- **Auth**: Required

---

### 5. My Booth (Seller)

#### `/my-booth` — Booth Dashboard (1103 lines)
- **Route**: `app/(main)/my-booth/page.tsx`
- **Key Elements**: 
  - Booth header with theme
  - Quick stats: products, orders, earnings
  - Product grid with edit/toggle
  - Order feed
  - Helper management
  - Sharing/invite tools
- **Auth**: Required (seller)
- **Validation**: Stats cards render, product grid visible, order list populates
- **🔔 NotificationBanner**: "new order alerts and buyer messages"

#### `/my-booth/products` — Product List (230 lines)
- **Route**: `app/(main)/my-booth/products/page.tsx`
- **Key Elements**: Product cards with status (active/inactive/flagged), add button
- **Auth**: Required (seller)

#### `/my-booth/products/new` — Create Product (662 lines)
- **Route**: `app/(main)/my-booth/products/new/page.tsx`
- **Key Elements**: Multi-step form: name, description, price, unit, photos, category, availability
- **Auth**: Required (seller)
- **Validation**: All form steps render, image upload works, product saves
- **🔔 Push Prompt**: After product creation via `showPrompt()`

#### `/my-booth/products/:id` — Edit Product (10 lines — redirect)
- **Route**: `app/(main)/my-booth/products/[id]/page.tsx`

#### `/my-booth/orders` — Seller Orders (98 lines)
- **Route**: `app/(main)/my-booth/orders/page.tsx`
- **Key Elements**: Order list filtered to seller's booth orders

#### `/my-booth/coupons` — Coupon Management (120 lines)
- **Route**: `app/(main)/my-booth/coupons/page.tsx`
- **Key Elements**: Create/edit coupons, promo code generation, share CTA

#### `/my-booth/customize` — Booth Customization (81 lines)
- **Route**: `app/(main)/my-booth/customize/page.tsx`
- **Key Elements**: Theme picker, header image upload, bio editor

#### `/my-booth/invitations` — Sent Invitations (159 lines)
- **Route**: `app/(main)/my-booth/invitations/page.tsx`
- **Key Elements**: List of pending/accepted helper invitations, revoke button

---

### 6. Helper System

#### `/join-booth/:code` — Accept Helper Invitation (369 lines)
- **Route**: `app/(main)/join-booth/[code]/page.tsx`
- **Key Elements**: 
  - Passcode entry (manual or pre-filled from URL)
  - Booth preview card with theme
  - Accept/Decline buttons
  - Success state with navigation
- **Auth**: Required
- **Validation**: Booth preview renders, accept flows to success state
- **🔔 Push Prompt**: After accepting helper role via `showPrompt()`

#### `/helping` — Booths I'm Helping (173 lines)
- **Route**: `app/(main)/helping/page.tsx`
- **Key Elements**: List of booths where user is a helper, quick links to manage

---

### 7. Chat & Messaging

#### `/chat` — Chat List (65 lines)
- **Route**: `app/(main)/chat/page.tsx`
- **Key Elements**: List of DM conversations, unread badges

#### `/chat/:id` — Chat Conversation (180 lines)
- **Route**: `app/(main)/chat/[id]/page.tsx`
- **Key Elements**: Message bubbles, input bar, avatars, timestamps

---

### 8. Community (Buzz)

#### `/community` — Buzz Feed (wrapper → ClientPage.tsx)
- **Route**: `app/(main)/community/page.tsx` → `app/(main)/community/ClientPage.tsx`
- **Key Elements**:
  - Post feed with media, replies, reactions
  - Compose bar with @mention picker
  - Suggestion chips for quick posts
  - Thread replies (inline expand)
  - Invite banner
- **Auth**: Required
- **Validation**: Feed loads posts, compose bar functional, @mentions autocomplete
- **🔔 Push Prompt**: After sending a Buzz post (covers @mention scenario)

#### `/following` — People I Follow (90 lines)
- **Route**: `app/(main)/following/page.tsx`
- **Key Elements**: Follow list with unfollow, booth links

---

### 9. Notifications & Profile

#### `/notifications` — Notification Center (151 lines)
- **Route**: `app/(main)/notifications/page.tsx`
- **Key Elements**: Notification list, read/unread state, deep links

#### `/profile` — View Profile (105 lines)
- **Route**: `app/(main)/profile/page.tsx`
- **Key Elements**: Avatar, name, stats, edit button

#### `/settings` — Settings (71 lines)
- **Route**: `app/(main)/settings/page.tsx`
- **Key Elements**: Push notification toggle, logout, account actions

---

### 10. Legal & Support

#### `/terms` — Terms & Policies (249 lines)
- **Route**: `app/(main)/terms/page.tsx`
- **Key Elements**: Terms of service, privacy policy, acceptance checkboxes (hidden when viewing from menu)

#### `/voice/board` — Feedback Board (218 lines)
- **Route**: `app/(main)/voice/board/page.tsx`
- **Key Elements**: Community feedback posts, upvote, status tags

#### `/voice/submit` — Submit Feedback (184 lines)
- **Route**: `app/(main)/voice/submit/page.tsx`
- **Key Elements**: Title, description, category, submit form

#### `/voice/ticket` — Support Ticket (220 lines)
- **Route**: `app/(main)/voice/ticket/page.tsx`
- **Key Elements**: Contact form, ticket history

---

## Push Notification Integration Summary

| Page | Banner | Modal | Trigger |
|------|--------|-------|---------|
| `/earnings` | ✅ | — | Passive |
| `/my-booth` | ✅ | — | Passive |
| `/orders/:id` | ✅ | ✅ | Chat message, dispute |
| `/market/booth/:id` | — | ✅ | After purchase |
| `/market/booth/:id/product/:productId` | — | ✅ | After purchase |
| `/my-booth/products/new` | — | ✅ | After product creation |
| `/community` | — | ✅ | After Buzz post |
| `/join-booth/:code` | — | ✅ | After helper acceptance |
| `/market` (closed) | — | Custom | Remind Me |

---

## Validation Bot Checklist

For each page, a production validation bot should verify:

1. **Page loads** — HTTP 200, no error boundary
2. **Key elements present** — Use unique element IDs or data-testid attributes
3. **Auth redirects** — Unauthenticated access redirects to `/login` for protected pages
4. **Component imports** — Critical components (NotificationBanner, NotificationPromptModal) are present
5. **Interactive elements** — Buttons, inputs, tabs respond to clicks
6. **Data loading** — API calls return data, empty states display correctly
7. **Mobile responsiveness** — Layout doesn't break at 375px viewport
