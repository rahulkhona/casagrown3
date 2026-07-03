# Email Notifications TODO

> Created: 2026-07-02 | Status: Planning

We currently only send: product approved, product flagged, community digest, transaction emails, and DM notifications. Below are the gaps to address.

---

## 📨 Transactional Emails (Edge Functions / Cron → Transactional Provider)

Real-time, triggered by system events. Must send immediately.

### High Priority

- [ ] **Listing expired / became unavailable**
  - Trigger: Expiry cron sets `is_active = false`
  - Tell seller their product went offline, link to relist
  
- [ ] **Listing expiring in 24hrs**
  - Trigger: Cron checks `expires_at < now() + interval '24 hours'`
  - Warn seller, link to extend/relist

- [ ] **Order not fulfilled — seller reminder**
  - Trigger: Cron, 2hrs before 24hr grace period ends
  - Warn seller they'll get auto-cancelled if they don't fulfill

- [ ] **Pickup window approaching — buyer reminder**
  - Trigger: Cron, 1hr before pickup window starts
  - Remind buyer of pickup time/location

- [ ] **Delivery window approaching — seller reminder**
  - Trigger: Cron, 1hr before delivery window starts
  - Remind seller of pending deliveries

- [ ] **Payment/payout failed**
  - Trigger: Stripe webhook (payment_intent.failed, payout.failed)
  - Notify seller/buyer of payment issue

### Medium Priority

- [ ] **First sale congratulations**
  - Trigger: First order completed for a seller
  - Celebrate the milestone, encourage continued selling

---

## 📬 Drip / Bulk Emails (Marketing Platform — Customer.io, Brevo, etc.)

Lifecycle-based, segment-driven. Subject to unsubscribe preferences.

### High Priority

- [ ] **Incomplete profile reminder**
  - Segment: `profile_completed_at IS NULL` AND account > 24hrs old
  - Nudge to complete profile (name, address required)

- [ ] **Welcome / onboarding drip**
  - Series: Day 0, Day 1, Day 3, Day 7 from `created_at`
  - Guide new users through first actions (browse, list, buy)

### Medium Priority

- [ ] **No listings in 7+ days — seller re-engagement**
  - Segment: Sellers with no `is_active = true` products for 7+ days
  - Encourage relisting, share tips

- [ ] **Weekly sales summary**
  - Batch: Weekly for sellers with any orders that week
  - Revenue, orders, views summary

- [ ] **Wishlist item back in stock**
  - Event: Product reactivated that a user had wishlisted
  - Alert buyer the item is available again

- [ ] **No activity in 14+ days — buyer re-engagement**
  - Segment: Last login > 14 days
  - Show what's new in their community

---

## Notes

- **Transactional emails** use a separate mail provider/domain from bulk for deliverability
- **Drip emails** must respect user unsubscribe preferences (`sms_enabled`, `notify_on_available`, etc.)
- Existing email functions to reference:
  - `send-market-email` — transactional
  - `send-notification-email` — notification delivery
  - `send-transaction-email` — payment related
  - `generate-community-digest` — community updates
