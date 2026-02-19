# Order Lifecycle & State Transitions

This document defines the complete order lifecycle, including state transitions,
point flows, and the roles of buyer and seller at each stage.

## Order Statuses

| Status      | Description                                                                            |
| :---------- | :------------------------------------------------------------------------------------- |
| `pending`   | Order placed by buyer. Points escrowed. Awaiting seller acceptance.                    |
| `accepted`  | Seller has accepted the order. Points still in escrow. Delivery expected.              |
| `delivered` | Seller marked delivery complete. Buyer confirms, or auto-confirms after timeout.       |
| `disputed`  | Buyer raised a dispute. Escalation flow begins.                                        |
| `cancelled` | Order cancelled (by buyer before acceptance, or by seller declining). Points refunded. |

---

## State Transition Diagram

```mermaid
stateDiagram-v2
    [*] --> pending : Buyer places order

    pending --> accepted : Seller accepts
    pending --> cancelled : Buyer cancels\nor Seller declines

    accepted --> delivered : Seller marks delivered
    accepted --> cancelled : Seller cancels\n(before delivery)
    accepted --> disputed : Buyer disputes\n(no delivery)

    delivered --> disputed : Buyer disputes\n(quality / wrong item)
    delivered --> [*] : Buyer confirms\nor auto-confirm timeout

    disputed --> [*] : Resolution\n(refund or dismiss)

    cancelled --> [*] : Points refunded
```

---

## Point Flow (Escrow Model)

Points are **never transferred directly** between buyer and seller. Instead they
flow through an escrow pattern tied to the order lifecycle.

### Point Transaction Types

| Type      | When                                            | Amount      | Description                   |
| :-------- | :---------------------------------------------- | :---------- | :---------------------------- |
| `escrow`  | Order placed (`pending`)                        | −N (buyer)  | Buyer's points held in escrow |
| `payment` | Order completed (delivered + confirmed)         | +N (seller) | Seller receives points        |
| `refund`  | Order cancelled or dispute resolved with refund | +N (buyer)  | Points returned to buyer      |

### Flow by Transition

```mermaid
sequenceDiagram
    participant B as Buyer
    participant E as Escrow (point_ledger)
    participant S as Seller

    B->>E: Place order (−100 pts, type=escrow)
    Note over E: Points held until resolution

    alt Seller Accepts → Delivered → Confirmed
        E->>S: Release to seller (+100 pts, type=payment)
    else Cancelled / Dispute Refund
        E->>B: Refund buyer (+100 pts, type=refund)
    end
```

---

## Transition Rules

### `pending` → `accepted`

- **Actor:** Seller
- **RPC function:** `accept_order_versioned(order_id, expected_version)`
- **Point action:** None — points remain in escrow
- **Version check:** Returns `VERSION_MISMATCH` if buyer modified the order
  since seller last viewed it
- **Side effects:** System message in conversation (with unit), reduces
  `want_to_sell_details.total_quantity_available`

### `pending` → `cancelled`

- **Actor:** Buyer (cancels) or Seller (declines)
- **RPC function:** `cancel_order_with_message(order_id, user_id)` or
  `reject_order_versioned(order_id, expected_version)`
- **Point action:** Refund buyer (type=`refund`, +N points)
- **Side effects:** System message in conversation (`sender_id = null`,
  `type = 'system'`); restores quantity if order was `accepted`

### `accepted` → `delivered`

- **Actor:** Seller
- **RPC function:**
  `mark_delivered(order_id, seller_id, proof_url, proof_location)`
- **Point action:** None yet — buyer must confirm first
- **Side effects:** Delivery proof stored (URL, geo location, timestamp), system
  message prompts buyer to confirm

### `accepted` → `cancelled`

- **Actor:** Seller (before delivery)
- **Point action:** Refund buyer
- **Side effects:** Same as pending→cancelled

### `accepted` → `disputed`

- **Actor:** Buyer (if seller hasn't delivered by expected date)
- **Point action:** None — points remain in escrow pending resolution
- **Side effects:** Escalation record created

### `delivered` → confirmed (terminal)

- **Actor:** Buyer confirms, or auto-confirm after timeout (e.g. 48h)
- **RPC function:** `confirm_order_delivery(order_id, buyer_id)`
- **Point action:** Release escrow to seller minus 10% platform fee
  (type=`payment`, +N points; type=`platform_fee`, −fee)
- **Side effects:** Role-specific system messages with `visible_to` metadata:
  buyer sees escrow release confirmation, seller sees payout details

### `delivered` → `disputed`

- **Actor:** Buyer (wrong item, quality issue, etc.)
- **RPC function:** `create_escalation(order_id, buyer_id, reason, proof_url)`
- **Point action:** None — points remain in escrow pending resolution
- **Side effects:** Escalation record created, delivery proof reviewed

### `disputed` → resolved (terminal)

- **Actor:** Admin or automated resolution
- **RPC functions:** `create_refund_offer`, `accept_refund_offer_with_message`,
  `resolve_dispute_with_message`
- **Point action:** Either refund buyer or release to seller depending on
  resolution
- **Side effects:** Escalation closed, role-specific system messages with
  `visible_to` metadata (buyer sees refund details, seller sees payout details)

---

## Database Tables Involved

| Table           | Role                                          |
| :-------------- | :-------------------------------------------- |
| `orders`        | Primary order record with `status` field      |
| `offers`        | The offer that generated this order           |
| `point_ledger`  | All point movements (escrow, payment, refund) |
| `conversations` | Chat thread between buyer and seller          |
| `chat_messages` | System messages for order events              |
| `escalations`   | Dispute records                               |
| `refund_offers` | Refund negotiation during disputes            |

---

## Edge Functions (Current & Planned)

| Function                           | Status   | Type      | Purpose                                     |
| :--------------------------------- | :------- | :-------- | :------------------------------------------ |
| `create-order`                     | ✅ Built | Edge func | Places order, escrows buyer points          |
| `accept_order_versioned`           | ✅ Built | SQL RPC   | Seller accepts with version check           |
| `reject_order_versioned`           | ✅ Built | SQL RPC   | Seller declines, refunds buyer              |
| `cancel_order_with_message`        | ✅ Built | SQL RPC   | Cancel by buyer or seller, refunds buyer    |
| `mark_delivered`                   | ✅ Built | SQL RPC   | Seller marks delivered with proof           |
| `confirm_order_delivery`           | ✅ Built | SQL RPC   | Buyer confirms receipt, releases escrow     |
| `create_escalation`                | ✅ Built | SQL RPC   | Buyer disputes order                        |
| `create_refund_offer`              | ✅ Built | SQL RPC   | Counter-offer during dispute                |
| `accept_refund_offer_with_message` | ✅ Built | SQL RPC   | Accept refund, close escalation             |
| `resolve_dispute_with_message`     | ✅ Built | SQL RPC   | Resolve dispute without refund              |
| `modify_order`                     | ✅ Built | SQL RPC   | Buyer modifies pending order, bumps version |

---

## Current Implementation Notes

- Orders are created via `create-order` edge function invoked from
  `OrderSheet.tsx`
- The `OrderSheet` shows a "Buy Points & Submit" flow when buyer has
  insufficient balance
- Points are escrowed immediately at order creation to prevent double-spending
- All order lifecycle transitions use SQL RPC functions with `SECURITY DEFINER`
  and `FOR UPDATE` row-level locking to prevent race conditions
- Optimistic locking via `version` column prevents stale accept/reject when
  buyer modifies a pending order
- System messages are auto-inserted into conversations for every state change
  with unit-aware formatting (e.g., "2 dozen Tomatoes")
- **Role-specific messages**: `confirm_order_delivery`, `accept_refund_offer`,
  and `resolve_dispute` insert separate system messages for buyer and seller,
  each with `metadata.visible_to = <user_id>`. Client filters messages so each
  user only sees their relevant notification.
- **Cancel messages**: `cancel_order_with_message` inserts a single system
  message (visible to all) with `sender_id = null` and `type = 'system'`
- `orders` table is added to `supabase_realtime` publication with
  `REPLICA IDENTITY FULL` for live UI updates
