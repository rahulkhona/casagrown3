---
name: sql-query-verification
description: Mandatory rules and protocol for generating SQL queries. Always inspect PostgreSQL information_schema.columns to verify exact table names and column names before writing or publishing any SQL query.
---

# SQL Query Verification Skill

This skill enforces strict database schema inspection BEFORE generating or publishing any SQL query to the user.

## Mandatory 2-Step Protocol

### Step 1: Schema Inspection
Before drafting any SQL query, ALWAYS run `information_schema.columns` or inspect local PostgreSQL migration definitions to verify:
1. Exact table name (e.g. `crm_produce_interests`, `crm_leads`, `profiles`, `crm_sequence_enrollments`).
2. Exact column names and data types (e.g. `p.zip_code` vs `l.zipcode`, `recipient_id` vs `user_id`, `is_active` vs `status`).
3. Foreign key relationships and join targets.

Example Inspection Command:
```bash
docker exec supabase_db_casagrown3 psql -U postgres -c "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name IN ('target_table1', 'target_table2') ORDER BY table_name, column_name;"
```

### Step 2: Query Execution Verification
Run the drafted query locally using `psql` to verify that:
- It executes with `0` syntax or compilation errors.
- Output columns match expected user requirements.

## Schema Reference Rules for CasaGrown Database

- **Profiles (`profiles`)**: Use `p.zip_code` (not `zipcode`).
- **Leads (`crm_leads`)**: Use `l.zipcode` (not `zip_code`).
- **Produce Interests (`crm_produce_interests`)**: Use `c.user_id` or `c.lead_id` (has NO direct `zip_code` column — join `profiles.zip_code` or `crm_leads.zipcode`). `c.zipcodes` is a `TEXT[]` array.
- **Market Booths (`market_booths`)**: Use `b.booth_zip` or `b.pickup_zip`.
- **Market Products (`market_products`)**: Use `mp.is_active = true` (has NO `status` column — check `b.status = 'active'` on `market_booths`).
- **Sequence Enrollments (`crm_sequence_enrollments`)**: Use `e.recipient_id` and `e.recipient_type` ('lead' / 'user').
