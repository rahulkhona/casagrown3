# Market Order Lifecycle Design

## Overview

> **Status**: Future — this document outlines the planned order lifecycle for
> when `market_orders` is implemented. Currently, the market only has booths,
> products, and coupons.

## Planned Flow

```
Browse → Add to Cart → Checkout → Place Order → Seller Confirms → Deliver/Pickup → Complete
```

## Planned Schema

### `market_orders`

| Column           | Type          | Description                            |
| :--------------- | :------------ | :------------------------------------- |
| `id`             | `uuid`        | Primary Key.                           |
| `buyer_id`       | `uuid`        | FK to `profiles(id)`.                  |
| `booth_id`       | `uuid`        | FK to `market_booths(id)`.             |
| `status`         | `text`        | pending → confirmed → delivered → completed |
| `total_usd`      | `numeric`     | Order total in USD.                    |
| `coupon_id`      | `uuid`        | FK to `market_coupons(id)`. Optional.  |
| `discount_usd`   | `numeric`     | Discount applied. Default: 0.          |
| `delivery_type`  | `text`        | `'delivery'` or `'pickup'`.            |
| `delivery_address`| `text`       | Delivery address (if delivery).        |
| `delivery_window`| `text`        | Selected time window.                  |
| `notes`          | `text`        | Buyer notes for seller.                |
| `created_at`     | `timestamptz` | Default `now()`.                       |
| `updated_at`     | `timestamptz` | Default `now()`.                       |

### `market_order_items`

| Column       | Type          | Description                            |
| :----------- | :------------ | :------------------------------------- |
| `id`         | `uuid`        | Primary Key.                           |
| `order_id`   | `uuid`        | FK to `market_orders(id)`.             |
| `product_id` | `uuid`        | FK to `market_products(id)`.           |
| `quantity`   | `integer`     | Quantity ordered.                      |
| `price_usd`  | `numeric`     | Price at time of order.                |
| `created_at` | `timestamptz` | Default `now()`.                       |

## Integration with Community

- Orders can use the shared `point_ledger` for points-based payments
- Chat between buyer/seller can extend the existing `conversations` pattern
- Delivery confirmation can use the existing `media_assets` for proof photos
