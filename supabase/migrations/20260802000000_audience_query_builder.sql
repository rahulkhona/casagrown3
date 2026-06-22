-- Migration: AI-Powered Audience Query Builder
-- Adds support for dynamic SQL-based audiences generated via AI natural language prompts.
-- Existing RPC-based audiences are fully backward compatible (is_dynamic defaults to false).
--
-- Key design decisions:
--   1. @audience:no tag in COMMENT ON TABLE excludes tables from AI context
--   2. get_queryable_schema() auto-discovers tables, columns, FKs, enums, comments
--   3. get_jsonb_column_schemas() samples real data to discover JSONB key structures
--   4. All three are fully runtime — zero static docs to maintain

-- ─── 1. Extend crm_audiences with dynamic query columns ─────────────────────
DO $$ BEGIN
  ALTER TABLE crm_audiences ADD COLUMN query_sql TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm_audiences ADD COLUMN query_source TEXT DEFAULT 'legacy'
    CHECK (query_source IN ('legacy', 'ai', 'manual'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm_audiences ADD COLUMN ai_prompt TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm_audiences ADD COLUMN ai_explanation TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm_audiences ADD COLUMN is_dynamic BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN crm_audiences.query_sql IS 'The validated SQL SELECT query for dynamic audiences. Executed via execute_audience_query() at campaign send time.';
COMMENT ON COLUMN crm_audiences.query_source IS 'How the query was created: legacy (RPC function), ai (AI-generated), or manual (hand-written SQL)';
COMMENT ON COLUMN crm_audiences.ai_prompt IS 'The natural language prompt the admin used to generate this audience query via AI';
COMMENT ON COLUMN crm_audiences.ai_explanation IS 'AI-generated plain-English explanation of what the SQL query does';
COMMENT ON COLUMN crm_audiences.is_dynamic IS 'If true, audience uses query_sql executed at runtime. If false, uses legacy audience_rpc_name.';


-- ─── 2. get_queryable_schema() — dynamic schema introspection ───────────────
-- Returns all public tables (excluding @audience:no tagged tables), their
-- columns (with types + comments), foreign keys, and enums.
-- Auto-discovers new tables/columns as they are added via migrations.

CREATE OR REPLACE FUNCTION get_queryable_schema()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT jsonb_build_object(
    'tables', (
      SELECT jsonb_agg(tbl ORDER BY tbl->>'name')
      FROM (
        SELECT jsonb_build_object(
          'name', t.table_name,
          'description', obj_description((t.table_schema || '.' || t.table_name)::regclass),
          'columns', (
            SELECT jsonb_agg(jsonb_build_object(
              'name', c.column_name,
              'type', c.data_type,
              'udt_name', c.udt_name,
              'is_nullable', c.is_nullable,
              'default', c.column_default,
              'description', col_description(
                (t.table_schema || '.' || t.table_name)::regclass, c.ordinal_position
              )
            ) ORDER BY c.ordinal_position)
            FROM information_schema.columns c
            WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
          )
        ) AS tbl
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND t.table_name NOT LIKE 'pg_%'
          -- Exclude tables tagged @audience:no in their comment
          AND COALESCE(obj_description((t.table_schema || '.' || t.table_name)::regclass), '')
              NOT LIKE '%@audience:no%'
      ) sub
    ),
    'foreign_keys', (
      SELECT jsonb_agg(jsonb_build_object(
        'source_table', kcu.table_name,
        'source_column', kcu.column_name,
        'target_table', ccu.table_name,
        'target_column', ccu.column_name
      ))
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    ),
    'enums', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', t.typname,
        'values', (
          SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
          FROM pg_enum e WHERE e.enumtypid = t.oid
        )
      ))
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'public' AND t.typtype = 'e'
    )
  );
$$;


-- ─── 3. get_jsonb_column_schemas() — runtime JSONB key discovery ─────────────
-- For every JSONB column in audience-queryable tables, samples up to 500 rows
-- and returns the distinct keys found with their value types.
-- This is fully automatic — new JSONB keys appear as data is written.

CREATE OR REPLACE FUNCTION get_jsonb_column_schemas()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  rec RECORD;
  result JSONB := '{}'::JSONB;
  col_keys JSONB;
  key_rec RECORD;
BEGIN
  -- Find all JSONB columns in audience-queryable tables (i.e. not @audience:no)
  FOR rec IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON c.table_schema = t.table_schema AND c.table_name = t.table_name
    WHERE c.table_schema = 'public'
      AND c.udt_name = 'jsonb'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT LIKE 'pg_%'
      AND COALESCE(obj_description(
        (c.table_schema || '.' || c.table_name)::regclass
      ), '') NOT LIKE '%@audience:no%'
  LOOP
    BEGIN
      -- Sample rows and extract distinct keys with their most common value type
      EXECUTE format(
        'SELECT jsonb_object_agg(k, t) FROM (
           SELECT DISTINCT ON (k) k, jsonb_typeof(val) AS t
           FROM (
             SELECT jsonb_each(%I) AS pair
             FROM %I
             WHERE %I IS NOT NULL AND %I != ''{}''::jsonb AND %I != ''[]''::jsonb
             LIMIT 500
           ) expanded,
           LATERAL (SELECT (pair).key AS k, (pair).value AS val) kv
           ORDER BY k
         ) typed_keys',
        rec.column_name, rec.table_name,
        rec.column_name, rec.column_name, rec.column_name
      ) INTO col_keys;

      IF col_keys IS NOT NULL AND col_keys != '{}'::JSONB THEN
        result := result || jsonb_build_object(
          rec.table_name || '.' || rec.column_name,
          col_keys
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Skip columns that error (e.g. array-type JSONB, permissions)
      NULL;
    END;
  END LOOP;

  RETURN result;
END;
$$;


-- ─── 4. execute_audience_query() — validated dynamic SQL executor ────────────
-- Executes a SELECT query and returns the standard audience row format.
-- Defense-in-depth: blocks any DML/DDL even though the AI already validates.

CREATE OR REPLACE FUNCTION execute_audience_query(p_query TEXT)
RETURNS TABLE(
  id UUID,
  recipient_type TEXT,
  email TEXT,
  phone TEXT,
  name TEXT,
  state_code TEXT,
  city TEXT,
  zip_code TEXT,
  community_h3 TEXT,
  joined_at TIMESTAMPTZ,
  accepts_email BOOLEAN,
  accepts_sms BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Block any write operations
  IF p_query ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY)\b' THEN
    RAISE EXCEPTION 'Query contains forbidden operation. Only SELECT queries are allowed.';
  END IF;

  -- Execute the dynamic query
  RETURN QUERY EXECUTE p_query;
END;
$$;


-- ─── 5. validate_audience_query() — syntax/semantic check via EXPLAIN ────────
-- Runs EXPLAIN on the query to check syntax and verify all referenced entities exist.
-- Returns { valid: true, estimated_rows: N } or { valid: false, error: '...' }

CREATE OR REPLACE FUNCTION validate_audience_query(p_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  explain_result JSONB;
  estimated_rows BIGINT;
BEGIN
  -- Block any write operations
  IF p_query ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY)\b' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Query contains forbidden operation. Only SELECT queries are allowed.');
  END IF;

  -- Try EXPLAIN to validate syntax and entity references
  BEGIN
    EXECUTE 'EXPLAIN (FORMAT JSON) ' || p_query INTO explain_result;

    -- Extract estimated rows from the top-level plan node
    estimated_rows := (explain_result->0->'Plan'->>'Plan Rows')::BIGINT;

    RETURN jsonb_build_object(
      'valid', true,
      'estimated_rows', COALESCE(estimated_rows, 0)
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', SQLERRM
    );
  END;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. TABLE AND COLUMN COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Convention: COMMENT ON TABLE must exist for every table.
--   - Include @audience:no if the table should NOT appear in AI query context.
--   - Table comments describe purpose; column comments describe semantics/lifecycles.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── 6a. IN-SCOPE market tables (no @audience:no tag) ────────────────────────

-- Profiles & Users
COMMENT ON TABLE profiles IS 'User profiles for all registered marketplace users. Primary identity table.';
COMMENT ON COLUMN profiles.full_name IS 'User display name';
COMMENT ON COLUMN profiles.phone_number IS 'User phone number for SMS';
COMMENT ON COLUMN profiles.email IS 'User email address';
COMMENT ON COLUMN profiles.home_community_h3_index IS 'H3 hex index of the users home community';
COMMENT ON COLUMN profiles.state_code IS 'Two-letter US state code (e.g. CA, TX)';
COMMENT ON COLUMN profiles.city IS 'User city name';
COMMENT ON COLUMN profiles.zip_code IS 'User ZIP code';
COMMENT ON COLUMN profiles.seller_avg_rating IS 'Materialized average seller rating (1-5), trigger-updated';
COMMENT ON COLUMN profiles.buyer_avg_rating IS 'Materialized average buyer rating (1-5), trigger-updated';
COMMENT ON COLUMN profiles.is_ghosted IS 'Shadow-ban flag — user can use the app but is invisible to others';
COMMENT ON COLUMN profiles.sms_enabled IS 'Whether user has opted in to receive SMS messages';
COMMENT ON COLUMN profiles.push_enabled IS 'Whether user has opted in to receive push notifications';
COMMENT ON COLUMN profiles.profile_completed_at IS 'Timestamp when user completed their profile setup. NULL = incomplete.';
COMMENT ON COLUMN profiles.referral_code IS 'Unique 8-char referral code for this user';
COMMENT ON COLUMN profiles.referred_by IS 'referral_code of the user who referred this user';
COMMENT ON COLUMN profiles.created_at IS 'Account registration timestamp';

-- Commerce
COMMENT ON TABLE market_booths IS 'Seller booth/storefront — one per seller. Stores booth identity, fulfillment options, and theme.';
COMMENT ON COLUMN market_booths.offers_delivery IS 'Whether this booth offers delivery';
COMMENT ON COLUMN market_booths.offers_pickup IS 'Whether this booth offers pickup';
COMMENT ON COLUMN market_booths.delivery_radius_miles IS 'Maximum delivery radius in miles';
COMMENT ON COLUMN market_booths.owner_id IS 'FK → profiles.id — the seller who owns this booth';

COMMENT ON TABLE market_products IS 'Per-market-day product listings posted by sellers';
COMMENT ON COLUMN market_products.category IS 'Product category (produce, herbs, baked, preserved, dairy, honey, eggs, etc.)';
COMMENT ON COLUMN market_products.is_active IS 'Whether the product listing is currently active/visible';
COMMENT ON COLUMN market_products.is_flagged IS 'Whether the product has been flagged by community moderation';
COMMENT ON COLUMN market_products.market_date IS 'The specific market day this product is listed for';
COMMENT ON COLUMN market_products.price_usd IS 'Price per unit in USD';
COMMENT ON COLUMN market_products.inventory IS 'Available inventory count';

COMMENT ON TABLE market_orders IS 'Individual order records — one per buyer-seller-product transaction';
COMMENT ON COLUMN market_orders.status IS 'Order lifecycle: pending → confirmed → delivering/ready_for_pickup → delivered → completed. Can also be: cancelled, declined, disputed, escalated, resolved';
COMMENT ON COLUMN market_orders.total_usd IS 'Total amount the buyer pays (subtotal + tax)';
COMMENT ON COLUMN market_orders.fulfillment_type IS 'Either delivery or pickup';
COMMENT ON COLUMN market_orders.buyer_rating IS 'Rating the buyer gave the seller (1-5), NULL if not yet rated';
COMMENT ON COLUMN market_orders.seller_rating IS 'Rating the seller gave the buyer (1-5), NULL if not yet rated';
COMMENT ON COLUMN market_orders.buyer_id IS 'FK → profiles.id';
COMMENT ON COLUMN market_orders.seller_id IS 'FK → profiles.id';
COMMENT ON COLUMN market_orders.delivery_proof IS 'JSONB array of proof objects: [{url, latitude, longitude, timestamp}]';

COMMENT ON TABLE market_holds IS 'Stripe PaymentIntent holds created at checkout, before order confirmation';
COMMENT ON TABLE market_blocks IS 'Trust & safety user-to-user blocks';
COMMENT ON TABLE order_disputes IS 'Order disputes between buyers and sellers — one per order max';
COMMENT ON TABLE order_status_log IS 'Complete order status change history with timestamps';

-- Financial
COMMENT ON TABLE market_ledger IS 'Append-only financial event log. Every money movement is recorded here.';
COMMENT ON TABLE market_settlements IS 'One settlement per market date — aggregates all orders for that day';
COMMENT ON TABLE user_settlements IS 'Per-user per-settlement payout breakdown with amounts and status';
COMMENT ON TABLE settlement_captures IS 'Per-hold Stripe capture/release tracking within a settlement';
COMMENT ON TABLE user_balances IS 'Materialized financial balance per user — available, pending, earned, spent';
COMMENT ON TABLE buyer_debts IS 'Outstanding buyer debts from failed payment captures';

-- Engagement
COMMENT ON TABLE product_comments IS 'Public Q&A comments on product listings';
COMMENT ON TABLE product_watches IS 'Users watching for specific products — "notify me when available"';
COMMENT ON TABLE product_reminders IS 'Per-user product availability reminders';
COMMENT ON TABLE product_flags IS 'Content moderation flags on products';
COMMENT ON TABLE market_followers IS 'Users following specific seller booths';
COMMENT ON TABLE market_conversations IS 'Direct message conversations between marketplace users';
COMMENT ON TABLE market_chat_messages IS 'Individual messages within marketplace DM conversations';

-- CRM & Marketing
COMMENT ON TABLE crm_leads IS 'Marketing leads captured from landing pages, ads, and referrals';
COMMENT ON COLUMN crm_leads.status IS 'Lead lifecycle: new → contacted → converted → archived';
COMMENT ON COLUMN crm_leads.source_platform IS 'Where the lead came from: facebook, instagram, google, direct';
COMMENT ON COLUMN crm_leads.converted_user_id IS 'If the lead registered, this links to their profiles.id';
COMMENT ON COLUMN crm_leads.accepts_email IS 'Whether the lead opted in to email';
COMMENT ON COLUMN crm_leads.accepts_sms IS 'Whether the lead opted in to SMS';
COMMENT ON COLUMN crm_leads.metadata IS 'JSONB — varies by source. Facebook: {fb_leadgen_id, fb_ad_id, fb_form_id, raw_fields}. Calculator: {garden_size, plants[], trees[], referrer, ai_estimate_result}. Nutrition: {nutrition_produce[], referrer, ai_nutrition_result}';

COMMENT ON TABLE crm_audiences IS 'Audience segment definitions — either legacy RPC-based or AI-generated SQL queries';
COMMENT ON TABLE crm_audience_functions IS 'Registry of audience SQL functions available for legacy audience creation';
COMMENT ON TABLE crm_campaigns IS 'Email and SMS campaign definitions with targeting, content, and send configuration';
COMMENT ON COLUMN crm_campaigns.stats IS 'JSONB — campaign metrics: {total_sent, opened, clicked, bounced, unsubscribed}';
COMMENT ON TABLE crm_campaign_sends IS 'Per-recipient send tracking for campaigns — tracks sent_at, opened_at, clicked_at, bounced, unsubscribed';
COMMENT ON TABLE crm_sequences IS 'Drip sequence definitions with DAG-based node/edge structure';
COMMENT ON TABLE crm_sequence_enrollments IS 'Per-user sequence enrollment tracking with current position and status';
COMMENT ON TABLE crm_promotions IS 'Promotional offer definitions with type, discount, and validity period';
COMMENT ON TABLE crm_promo_enrollments IS 'User enrollment records for promotions';
COMMENT ON TABLE crm_user_metadata IS 'Wide denormalized CRM profile with 50+ scalar columns covering engagement, attribution, buyer/seller activity, financials, trust scores, and CRM health metrics. Auto-populated via triggers. Preferred table for simple audience filtering — no JSONB columns.';
COMMENT ON TABLE crm_page_visits IS 'Landing page visit tracking with UTM parameters and referrer';
COMMENT ON TABLE crm_page_events IS 'Page-level event tracking: button_click, calculator_used, form_start, form_abandon, cta_clicked, scroll_50, scroll_90';
COMMENT ON TABLE crm_short_links IS 'Tracked short links with redirect URLs and click counting';
COMMENT ON TABLE crm_landing_pages IS 'CRM landing page definitions with slug and configuration';
COMMENT ON TABLE referral_touches IS 'Referral attribution tracking — captures which referral code brought a user';
COMMENT ON TABLE beta_testers IS 'Pre-launch beta tester signups with contact info and referral source';

-- Subscriptions
COMMENT ON TABLE seller_subscriptions IS 'Pro seller subscription status with tier, billing dates, and Stripe subscription ID';

-- Geo reference (in-scope because useful for geo-targeting)
COMMENT ON TABLE counties IS 'US county reference data with state FK and FIPS code';
COMMENT ON TABLE quarantine_zones IS 'USDA agricultural pest quarantine zones by jurisdiction and category';
COMMENT ON TABLE sales_categories IS 'Dynamic product category definitions used across the marketplace';
COMMENT ON TABLE category_restrictions IS 'Per-jurisdiction category bans (state/county level)';


-- ─── 6a-ii. JSONB column schemas (code-derived baselines) ────────────────────
-- These COMMENT ON COLUMN statements document the known internal structure of
-- JSONB columns, derived from analyzing the code that writes to them.
-- Provides AI context even when the database has little or no data.
-- The runtime get_jsonb_column_schemas() function supplements these with
-- any additional keys discovered in actual data.

-- crm_leads.metadata — varies by lead source funnel
COMMENT ON COLUMN crm_leads.metadata IS 'JSONB — structure varies by source. Facebook Lead Ads: {fb_leadgen_id: string, fb_ad_id: string, fb_form_id: string, fb_page_id: string, raw_fields: {email, full_name, phone_number}}. Earnings Calculator: {garden_size: "small"|"medium"|"large", plants: string[], trees: string[], referrer: string, ai_estimate_result: object}. Nutrition Calculator: {nutrition_produce: string[], nutrition_produce_sorted: string, referrer: string, ai_nutrition_result: object}. Query examples: metadata->>''garden_size'', metadata->''plants'', metadata->>''fb_ad_id'', metadata->>''referrer''';

-- crm_campaigns.stats — campaign performance metrics
COMMENT ON COLUMN crm_campaigns.stats IS 'JSONB — campaign metrics aggregated after send: {total_sent: integer, opened: integer, clicked: integer, bounced: integer, unsubscribed: integer}. Query example: (stats->>''opened'')::int';

-- crm_sequences.definition — DAG-based drip sequence definition
COMMENT ON COLUMN crm_sequences.definition IS 'JSONB — DAG structure for drip sequences: {nodes: [{id: string, type: "send_email"|"wait"|"condition", data: {templateAlias, subject, delay}}], edges: [{source: string, target: string, label: "yes"|"no"}], startNodeId: string}. Rarely queried directly for audience building.';

-- market_orders.delivery_proof — delivery photo proof with geolocation
COMMENT ON COLUMN market_orders.delivery_proof IS 'JSONB array of delivery proof objects: [{url: string (storage URL), latitude: numeric, longitude: numeric, timestamp: timestamptz}]. Query examples: delivery_proof->0->>''latitude'', jsonb_array_length(delivery_proof) > 0';

-- market_ledger.metadata — supplementary financial event data
COMMENT ON COLUMN market_ledger.metadata IS 'JSONB — supplementary info on ledger events. Usually empty {}. May contain {reason: string} for manual adjustments.';

-- market_settlements.reconciliation_check — settlement verification data
COMMENT ON COLUMN market_settlements.reconciliation_check IS 'JSONB — reconciliation verification data for settlement clearing. Internal use.';

-- market_chat_messages.media — chat message media attachments
COMMENT ON COLUMN market_chat_messages.media IS 'JSONB array of media objects: [{type: "image"|"video", url: string, thumbnail_url: string}]';

-- market_conversations.metadata — conversation metadata
-- (skipping if this column exists — check at runtime)

-- crm_page_visits — no JSONB columns (all structured)
-- crm_page_events — no JSONB columns (all structured)
-- crm_user_metadata — no JSONB columns (all 50+ scalar columns)


-- ─── 6b. OUT-OF-SCOPE tables — tagged @audience:no ───────────────────────────

-- Community App (deprecated next-community)
COMMENT ON TABLE community_chat_messages IS '@audience:no Community group chat messages — next-community app';
COMMENT ON TABLE community_chat_reactions IS '@audience:no Community chat emoji reactions';
COMMENT ON TABLE community_chat_flags IS '@audience:no Flagged community chat messages';
COMMENT ON TABLE community_chat_mutes IS '@audience:no Per-user community chat mutes';
COMMENT ON TABLE community_discussion_topics IS '@audience:no Community discussion topics — next-community app';
COMMENT ON TABLE community_digests IS '@audience:no AI-generated community chat summaries';

-- Voice App (next-community-voice)
COMMENT ON TABLE feedback_comment_media IS '@audience:no Voice app feedback media attachments';
COMMENT ON TABLE feedback_flags IS '@audience:no Voice app content moderation flags';
COMMENT ON TABLE feedback_status_history IS '@audience:no Voice app feedback status tracking';

-- Admin / Internal
COMMENT ON TABLE staff_members IS '@audience:no Internal admin staff accounts and permissions';
COMMENT ON TABLE platform_bank_ledger IS '@audience:no Internal platform-level financial ledger';
COMMENT ON TABLE platform_settings IS '@audience:no Internal platform key-value settings';
COMMENT ON TABLE platform_fees IS '@audience:no Internal platform fee configuration';
COMMENT ON TABLE edge_function_errors IS '@audience:no Edge function error logging';
COMMENT ON TABLE client_errors IS '@audience:no Frontend error tracking';
COMMENT ON TABLE profile_audit_log IS '@audience:no Internal profile field change audit trail';
COMMENT ON TABLE dispute_admin_views IS '@audience:no Admin dispute view tracking';
COMMENT ON TABLE obsolete_cleanup_logs IS '@audience:no Internal deprecation cleanup log';
COMMENT ON TABLE obsolete_usage_logs IS '@audience:no Internal deprecation telemetry';
COMMENT ON TABLE manual_refund_checks IS '@audience:no Internal manual refund check tracking';
COMMENT ON TABLE blocked_products IS '@audience:no Admin-blocked product tracking';

-- Infrastructure / Caches
COMMENT ON TABLE push_subscriptions IS '@audience:no Device web push notification tokens';
COMMENT ON TABLE push_notification_log IS '@audience:no Push notification delivery log';
COMMENT ON TABLE sms_notification_log IS '@audience:no SMS notification delivery log';
COMMENT ON TABLE sms_rate_limits IS '@audience:no SMS OTP rate limiting';
COMMENT ON TABLE address_resolution_cache IS '@audience:no USPS address lookup cache';
COMMENT ON TABLE zip_tax_cache IS '@audience:no Cached ZIP to tax rate lookups';
COMMENT ON TABLE zip_prefix_to_zone IS '@audience:no ZIP prefix to USDA zone mapping cache';
COMMENT ON TABLE usda_zone_produce IS '@audience:no USDA growing zone produce reference';
COMMENT ON TABLE giftcards_cache IS '@audience:no Cached gift card catalog from external providers';
COMMENT ON TABLE charity_projects_cache IS '@audience:no Cached GlobalGiving charity project catalog';
COMMENT ON TABLE nutrition_item_cache IS '@audience:no Cached nutritional data for produce';
COMMENT ON TABLE closed_emails IS '@audience:no Email suppression/closure tracking';
COMMENT ON TABLE garden_produce_catalog IS '@audience:no Reference produce catalog for garden features';

-- Points / Redemption System
COMMENT ON TABLE point_ledger IS '@audience:no Points transaction history — legacy community feature';
COMMENT ON TABLE purchased_points_buckets IS '@audience:no FIFO point bucket tracking for compliance';
COMMENT ON TABLE point_bucket_consumptions IS '@audience:no Per-bucket debit records';
COMMENT ON TABLE point_purchase_limits IS '@audience:no Per-user point purchase limits';
COMMENT ON TABLE redemptions IS '@audience:no Gift card/donation/cashout redemption records';
COMMENT ON TABLE redemption_queue IS '@audience:no Redemption processing queue';
COMMENT ON TABLE provider_transactions IS '@audience:no External provider API transaction records';
COMMENT ON TABLE provider_accounts IS '@audience:no External provider account configuration';
COMMENT ON TABLE provider_queue_status IS '@audience:no Provider circuit breaker status';
COMMENT ON TABLE instrument_queuing_status IS '@audience:no Redemption instrument queuing status';
COMMENT ON TABLE available_redemption_methods IS '@audience:no Redemption method definitions';
COMMENT ON TABLE available_redemption_method_instruments IS '@audience:no Redemption instrument definitions';
COMMENT ON TABLE state_redemption_method_blocks IS '@audience:no Per-state redemption method blocks';
COMMENT ON TABLE donation_receipts IS '@audience:no Donation fulfillment records';
COMMENT ON TABLE gift_card_deliveries IS '@audience:no Gift card fulfillment records';
COMMENT ON TABLE country_refund_fees IS '@audience:no Per-country refund fee configuration';
COMMENT ON TABLE small_balance_refund_thresholds IS '@audience:no Refund threshold configuration';
COMMENT ON TABLE digital_receipts IS '@audience:no Auto-generated digital receipt records';
COMMENT ON TABLE receipt_footers IS '@audience:no Receipt footer customization';
COMMENT ON TABLE user_auto_redemption_config IS '@audience:no User auto-redemption settings';
COMMENT ON TABLE user_credits IS '@audience:no User credit balances for dispute resolution';
COMMENT ON TABLE credit_usage_log IS '@audience:no Credit usage tracking';
COMMENT ON TABLE user_incentives IS '@audience:no Recurring user incentive tracking';

-- GrowBot / Chatbot
COMMENT ON TABLE growbot_rules IS '@audience:no GrowBot AI rule definitions';
COMMENT ON TABLE growbot_seller_rules IS '@audience:no Seller-specific GrowBot rules';
COMMENT ON TABLE growbot_skills IS '@audience:no GrowBot skill definitions';
COMMENT ON TABLE growbot_shared_responses IS '@audience:no GrowBot shared poll responses';
COMMENT ON TABLE growbot_response_suggestions IS '@audience:no GrowBot response suggestions';
COMMENT ON TABLE growbot_response_votes IS '@audience:no GrowBot response voting';
COMMENT ON TABLE growbot_user_facts IS '@audience:no GrowBot user fact memory store';
COMMENT ON TABLE growbot_token_usage IS '@audience:no GrowBot token usage tracking';
COMMENT ON TABLE bot_reply_drafts IS '@audience:no GrowBot copilot draft replies';
COMMENT ON TABLE widget_chat_sessions IS '@audience:no Embeddable web chat widget sessions';

-- Social / External Integrations
COMMENT ON TABLE ig_conversations IS '@audience:no Instagram conversation sync';
COMMENT ON TABLE ig_messages IS '@audience:no Instagram message sync';
COMMENT ON TABLE messenger_conversations IS '@audience:no Facebook Messenger conversation sync';
COMMENT ON TABLE messenger_messages IS '@audience:no Facebook Messenger message sync';
COMMENT ON TABLE wa_conversations IS '@audience:no WhatsApp conversation sync';
COMMENT ON TABLE wa_messages IS '@audience:no WhatsApp message sync';
COMMENT ON TABLE fb_post_queue IS '@audience:no Facebook auto-posting queue';
COMMENT ON TABLE fb_auto_post_log IS '@audience:no Facebook auto-posting log';
COMMENT ON TABLE seller_fb_connections IS '@audience:no Seller Facebook page connections';
COMMENT ON TABLE seller_google_connections IS '@audience:no Seller Google Business connections';
COMMENT ON TABLE booth_fb_catalogs IS '@audience:no Facebook catalog sync per booth';
COMMENT ON TABLE product_fb_sync IS '@audience:no Per-product Facebook sync status';

-- Misc Config / Reference
COMMENT ON TABLE demo_booth_templates IS '@audience:no Demo booth seed data for onboarding';
COMMENT ON TABLE demo_product_catalog IS '@audience:no Demo product seed data for onboarding';
COMMENT ON TABLE catalog_items IS '@audience:no Multi-stand unified product catalog';
COMMENT ON TABLE dfc_category_map IS '@audience:no DFC standard category mapping';
COMMENT ON TABLE ofn_enterprises IS '@audience:no Open Food Network enterprise cache';
COMMENT ON TABLE ofn_product_cache IS '@audience:no Open Food Network product cache';
COMMENT ON TABLE incentive_campaigns IS '@audience:no Legacy incentive campaign definitions';
COMMENT ON TABLE campaign_zones IS '@audience:no Legacy campaign zone targeting';
COMMENT ON TABLE campaign_rewards IS '@audience:no Legacy campaign reward definitions';
COMMENT ON TABLE quarantine_bot_health IS '@audience:no Bot health check monitoring';
COMMENT ON TABLE quarantine_pest_categories IS '@audience:no Bot pest-category mapping cache';
COMMENT ON TABLE market_schedule_policies IS '@audience:no Market scheduling policy configuration';
COMMENT ON TABLE market_settings IS '@audience:no Per-booth key-value settings';
COMMENT ON TABLE subscription_tiers IS '@audience:no Subscription tier definitions';
COMMENT ON TABLE subscription_tier_price_history IS '@audience:no Subscription tier price history';
COMMENT ON TABLE subscription_receipts IS '@audience:no Subscription billing receipt records';
COMMENT ON TABLE user_subscription_discounts IS '@audience:no Per-user subscription discounts';
COMMENT ON TABLE buyer_product_notifications IS '@audience:no Buyer notification preferences per product';
COMMENT ON TABLE pro_testers IS '@audience:no Pro feature tester list';
COMMENT ON TABLE stripe_disputes IS '@audience:no Stripe dispute event records';
COMMENT ON TABLE stripe_payout_events IS '@audience:no Stripe payout event records';
COMMENT ON TABLE stripe_connect_audit_log IS '@audience:no Stripe Connect audit trail';
COMMENT ON TABLE crm_assets IS '@audience:no CRM media assets for campaigns';
COMMENT ON TABLE crm_data_sources IS '@audience:no CRM data source function registry';
COMMENT ON TABLE crm_promo_buyer_discounts IS '@audience:no Unified buyer discount promo config';
COMMENT ON TABLE crm_promo_subscription_discounts IS '@audience:no Subscription discount promo config';
COMMENT ON TABLE crm_promo_giveaways IS '@audience:no Giveaway promotion config';
COMMENT ON TABLE feature_waitlist IS '@audience:no Feature waitlist signups';
COMMENT ON TABLE category_tax_rules IS '@audience:no Per-state tax rule configuration';
COMMENT ON TABLE product_tax_overrides IS '@audience:no Per-product tax override config';
COMMENT ON TABLE tax_reporting_thresholds IS '@audience:no 1099-K tax reporting threshold config';
COMMENT ON TABLE market_state_blocks IS '@audience:no Per-state marketplace enable/disable toggle';
COMMENT ON TABLE market_reminders IS '@audience:no Scheduled market reminder config';
COMMENT ON TABLE market_notifications IS '@audience:no In-app notification records';
COMMENT ON TABLE order_chat_messages IS '@audience:no In-order buyer/seller chat messages';
COMMENT ON TABLE order_dispute_messages IS '@audience:no Dispute thread messages';
COMMENT ON TABLE market_chat_reactions IS '@audience:no DM chat reactions';
COMMENT ON TABLE comment_flags IS '@audience:no Product comment moderation flags';
COMMENT ON TABLE comment_likes IS '@audience:no Product comment likes';
COMMENT ON TABLE short_link_clicks IS '@audience:no Short link click event log';
COMMENT ON TABLE user_analytics IS '@audience:no User engagement analytics events';
