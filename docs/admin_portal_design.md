# Admin Portal — Design Document

**App**: `apps/next-admin/` (Next.js, port 3003)\
**Last Updated**: March 12, 2026\
**Status**: ✅ Fully implemented with 32 E2E + 10 unit tests

---

## 1. Overview

The Admin Portal is an internal-use Next.js web application that provides
CasaGrown staff with full control over platform configuration, compliance rules,
campaigns, and user management. It runs on port 3003 and uses the Supabase
service role key (`SUPABASE_SERVICE_ROLE_KEY`) for unrestricted database access,
bypassing RLS.

### Architecture

```
apps/next-admin/
├── app/
│   ├── layout.tsx              # Root layout + suppressHydrationWarning
│   ├── auth-guard.tsx          # Staff role gate (redirects non-admins)
│   ├── login/page.tsx          # Admin login screen
│   ├── unauthorized/page.tsx   # Access denied screen
│   └── (dashboard)/            # Dashboard layout group
│       ├── layout.tsx          # Sidebar navigation + responsive shell
│       ├── page.tsx            # Dashboard home (overview)
│       ├── campaigns/          # Incentive campaigns CRUD
│       ├── tax-rules/          # Sales tax rule management
│       ├── post-policies/      # Post expiration day config
│       ├── platform-settings/  # Grace period + fee ledger
│       ├── methods/            # Redemption method toggling
│       ├── category-restrictions/
│       ├── product-restrictions/
│       ├── sales-categories/
│       └── users/              # Staff & Roles
├── lib/
│   └── adminSupabase.ts        # Singleton service-role client
└── public/
    └── logo.png
```

### Key Design Decisions

- **Service-role Supabase client** with `persistSession: false` and
  `autoRefreshToken: false` to prevent user JWT hijack
- **`has_staff_role()` RLS** on all admin-managed tables (not `user_id = auth.uid()`)
- **Shared components**: `AdminDataForm` (configurable CRUD forms with select
  dropdowns), `AdminDataGrid` (sortable data tables), `AdminMapWidget` (H3 zone
  targeting with Leaflet + h3-js)

---

## 2. Pages

### 2.1 Campaigns

Full CRUD for incentive campaigns with nested campaign rewards.

| Operation | Description |
| :-------- | :---------- |
| **Create** | Name, start/end dates, zone targeting (optional). Each campaign has 1+ reward rows linking behavior → points. |
| **Read** | List view with name, date range, active status. Expandable rows show rewards and zone info. |
| **Toggle** | Activate/deactivate campaigns via switch. |
| **Edit** | Modify name, dates. |
| **Delete** | Cascade-deletes linked `campaign_rewards` rows. |

**Zone Targeting**: Uses `AdminMapWidget` with H3 resolution-7. Search by
location (Nominatim geocoding), auto-fills all cells inside the polygon boundary.
h3-js v4 `polygonToCells` uses GeoJSON `[lng, lat]` order directly — no
coordinate swap needed.

### 2.2 Sales Tax Rules

CRUD for state-level sales tax rules with retire-and-replace edit pattern.

| Operation | Description |
| :-------- | :---------- |
| **Create** | Select state, set rule type (`fixed`/`evaluate`), rate percentage. |
| **Edit** | Click pencil icon → pre-fills form → saves new rule + retires old (sets `retired_at`). |
| **Delete** | Hard-delete the rule. |

### 2.3 Post Policies

Editable expiration days per post type with dirty detection.

| Post Type | Default Expiration |
| :-------- | -----------------: |
| `want_to_sell` | 14 days |
| `want_to_buy` | 7 days |
| `offering_service` | 30 days |
| `need_service` | 7 days |
| `seeking_advice` | 30 days |
| `general_info` | 30 days |

Save button appears only when a value differs from its original. Action column
shows "—" for unchanged rows.

### 2.4 Platform Settings

Two sections:

1. **Grace Period**: Configurable provider disabled grace window (hours). Stored
   in `platform_config`.
2. **Fee Ledger**: View existing platform fees. "Add Fee" creates a new ledger
   entry with description, percentage, and effective date.

### 2.5 Redemption Methods

Toggle-based management for 4 redemption method categories:

| Method | Instruments | Toggles |
| :----- | :---------- | :------ |
| Gift Cards | Tremendous, Reloadly | Active, Queue Redemptions |
| Cash Out | PayPal, Venmo | Active, Queue Redemptions |
| Charity | GlobalGiving | Active, Queue Redemptions |
| Refund | — | Active |

Each toggle updates `available_redemption_method_instruments` with
`is_active`/`queue_redemptions` flags.

### 2.6 Category Restrictions

Manage category blocks by jurisdiction (global or per-H3-zone).

### 2.7 Product Restrictions

Block specific product names within categories and zones.

### 2.8 Sales Categories

Manage the dynamic `sales_categories` table entries.

### 2.9 Staff & Roles (Users)

View and manage `staff_members` table entries for admin access control.

---

## 3. Authentication & Authorization

- Login via Supabase Auth (email + password)
- `auth-guard.tsx` checks `has_staff_role(uid, 'admin')` on every page load
- Non-admin users redirected to `/unauthorized`
- `adminSupabase` client uses service role key for all DB operations

---

## 4. Database Tables Managed

| Table | Admin Operations |
| :---- | :--------------- |
| `incentive_campaigns` | Full CRUD |
| `campaign_rewards` | Nested CRUD via campaigns |
| `campaign_zones` | Managed via map widget |
| `sales_tax_rules` | Create, retire-edit, delete |
| `post_type_policies` | Update expiration days |
| `platform_config` | Update grace period |
| `platform_fees` | Create new fees |
| `available_redemption_method_instruments` | Toggle active/queue |
| `category_restrictions` | Full CRUD |
| `blocked_products` | Full CRUD |
| `sales_categories` | Full CRUD |
| `staff_members` | View/manage |

**RLS Policies**: All admin-managed tables use
`has_staff_role(auth.uid(), 'admin')` for ALL operations. Fixed by migrations
`20260308000000_fix_admin_rls` and `20260311000200_post_policies_admin_rls`.

---

## 5. Testing

### E2E Tests (Playwright)

**Config**: `e2e/playwright/admin-playwright.config.ts` (port 3003)\
**Setup**: `tests/admin.setup.ts` (authenticates as admin user)\
**Helpers**: `helpers/supabase-db.ts` (`dbQuery`, `dbUpdate`, `dbDelete`)

| Spec File | Tests | Coverage |
| :-------- | ----: | :------- |
| `admin-campaigns.spec.ts` | 7 | Create, toggle, edit, delete, expand, cancel |
| `admin-methods.spec.ts` | 9 | Card rendering, provider display, all toggles |
| `admin-platform-settings.spec.ts` | 4 | Page render, grace period, fee ledger, add fee |
| `admin-post-policies.spec.ts` | 6 | Render, headers, edit, save, unchanged, multi |
| `admin-tax-rules.spec.ts` | 5 | Page render, create, exempt, delete, edit |
| `admin.setup.ts` | 1 | Auth setup |
| **Total** | **32** | |

### Unit Tests (Jest)

**File**: `packages/app/features/admin/components/zone-coverage.test.ts`\
**Tests**: 10 — covering `polygonToCells` coordinate order, containment modes,
GeoJSON formats, additive merging, determinism, and ZIP-code-sized area sanity check.
