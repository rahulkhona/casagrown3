-- ============================================================================
-- Migration: Explicit Data API Grants & Profile PII Protection
-- Supabase is removing default public schema exposure (Oct 30, 2026).
-- This migration:
--   1. Protects profile PII with column-level grants for anon
--   2. Creates a public_profiles convenience view
--   3. Adds explicit per-table GRANTs for all roles
-- ============================================================================

-- ============================================================================
-- PART 1: Profile PII Protection
-- Problem: anon role has full SELECT on profiles with USING(true) RLS policy,
-- exposing email, phone_number, street_address, city, state_code, zip_plus4,
-- phone_verification_code, referral_code, etc. to unauthenticated users.
--
-- Fix: Column-level GRANT — anon can only SELECT safe display columns.
-- The FK join `profiles!posts_author_id_fkey(full_name, avatar_url)` used by
-- shareable post pages continues to work because those columns are granted.
-- ============================================================================

-- 1a. Revoke the dangerous blanket anon RLS policies on profiles
-- (Created in 20260212000000_public_post_anon_rls.sql and
--  20260207000000_profiles_public_read_rls.sql)
DROP POLICY IF EXISTS "Anonymous can view profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can view profiles for invite lookup" ON profiles;

-- 1b. Revoke table-level anon SELECT (removes blanket access)
REVOKE SELECT ON profiles FROM anon;

-- 1c. Grant column-level SELECT to anon — ONLY safe display columns
-- These are the only columns anonymous users (shareable post pages,
-- GrowBot guest views, etc.) need to render user cards.
-- PII columns (email, phone_number, street_address, city, state_code,
-- zip_plus4, phone_verification_code, referral_code, ban_reason, etc.)
-- are NOT granted and will return a permission error if queried.
GRANT SELECT (
  id,
  full_name,
  avatar_url,
  home_community_h3_index,
  phone_verified,
  created_at,
  closure_status
) ON profiles TO anon;

-- 1d. Re-create anon RLS policy scoped to the safe columns only
-- (RLS must allow the row access; column-level grant controls which columns)
CREATE POLICY "Anon can view safe profile columns"
  ON profiles FOR SELECT TO anon
  USING (true);

-- 1e. Create a convenience view for any new code that only needs safe columns
CREATE OR REPLACE VIEW public_profiles AS
SELECT
  id,
  full_name,
  avatar_url,
  home_community_h3_index,
  phone_verified,
  created_at,
  closure_status
FROM profiles;

GRANT SELECT ON public_profiles TO anon, authenticated;

-- 1f. Ensure authenticated users still have full access (RLS controls rows)
-- (The existing "Authenticated users can view profiles" policy stays)
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT ALL ON profiles TO service_role;

-- ============================================================================
-- PART 2: Explicit GRANTs — Tier 1 (Public Read)
-- anon + authenticated: SELECT
-- authenticated: INSERT, UPDATE, DELETE
-- ============================================================================

-- Public community/market data
GRANT SELECT ON communities TO anon, authenticated;
GRANT SELECT ON market_booths TO anon, authenticated;
GRANT SELECT ON market_products TO anon, authenticated;
GRANT SELECT ON market_schedule_policies TO anon, authenticated;
GRANT SELECT ON market_settings TO anon, authenticated;
GRANT SELECT ON sales_categories TO anon, authenticated;
GRANT SELECT ON blocked_products TO anon, authenticated;
GRANT SELECT ON category_restrictions TO anon, authenticated;
GRANT SELECT ON zone_pulse TO anon, authenticated;
GRANT SELECT ON usda_zone_produce TO anon, authenticated;
GRANT SELECT ON zip_prefix_to_zone TO anon, authenticated;
GRANT SELECT ON zip_codes TO anon, authenticated;
GRANT SELECT ON demo_booth_templates TO anon, authenticated;
GRANT SELECT ON demo_product_catalog TO anon, authenticated;

-- Public CRM pages
GRANT SELECT ON crm_landing_pages TO anon, authenticated;
GRANT SELECT, UPDATE ON crm_short_links TO anon, authenticated;

-- Public feedback/reviews
GRANT SELECT ON user_feedback TO anon, authenticated;
GRANT SELECT ON feedback_votes TO anon, authenticated;

-- Public posts & related tables (shareable links)
GRANT SELECT ON posts TO anon, authenticated;

-- ============================================================================
-- PART 3: Explicit GRANTs — Tier 2 (Authenticated Full Access)
-- authenticated: SELECT, INSERT, UPDATE, DELETE
-- RLS policies control row-level access
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_chat_reactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_followers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON community_chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON community_chat_reactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON community_chat_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON community_chat_mutes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON community_discussion_topics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON community_digests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON booth_helpers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON grower_produces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON grower_search_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_watches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON comment_likes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON comment_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON order_chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growbot_user_facts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growbot_skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growbot_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growbot_shared_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growbot_response_votes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growbot_response_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growbot_token_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON nutrition_item_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_garden TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_analytics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_incentives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_credits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON credit_usage_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON referral_touches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON produce_interests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON followers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON feedback_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON feedback_media TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON feedback_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON client_errors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON obsolete_usage_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON obsolete_cleanup_logs TO authenticated;

-- Market financial tables (authenticated, RLS-protected)
GRANT SELECT ON market_holds TO authenticated;
GRANT SELECT ON market_settlements TO authenticated;
GRANT SELECT ON point_ledger TO authenticated;
GRANT SELECT ON redemptions TO authenticated;

-- Disputes (authenticated + service_role for edge functions)
GRANT SELECT, INSERT ON order_disputes TO authenticated;
GRANT SELECT, INSERT ON order_dispute_messages TO authenticated;

-- ============================================================================
-- PART 4: Explicit GRANTs — Tier 3 (Service-Role Only for CRM Tracking)
-- Only edge functions write to these tables, not anon clients.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON crm_leads TO service_role;
GRANT SELECT, INSERT, UPDATE ON crm_page_visits TO service_role;
GRANT SELECT, INSERT ON crm_page_events TO service_role;
-- Also grant authenticated SELECT for admin dashboard display
GRANT SELECT ON crm_leads TO authenticated;
GRANT SELECT ON crm_page_visits TO authenticated;
GRANT SELECT ON crm_page_events TO authenticated;

-- ============================================================================
-- PART 5: Explicit GRANTs — Tier 4 (Admin / Service-Role)
-- service_role: ALL (for edge functions and cron jobs)
-- authenticated: SELECT + limited CUD (for admin app with staff RLS)
-- ============================================================================

-- Admin staff
GRANT SELECT ON staff_members TO authenticated;
GRANT ALL ON staff_members TO service_role;

-- Financial internals
GRANT SELECT ON platform_bank_ledger TO authenticated;
GRANT ALL ON platform_bank_ledger TO service_role;
GRANT SELECT ON buyer_debts TO authenticated;
GRANT ALL ON buyer_debts TO service_role;
GRANT SELECT ON platform_fees TO authenticated;
GRANT ALL ON platform_fees TO service_role;
GRANT SELECT ON receipt_footers TO authenticated;
GRANT ALL ON receipt_footers TO service_role;
GRANT SELECT ON tax_reporting_thresholds TO authenticated;
GRANT ALL ON tax_reporting_thresholds TO service_role;
GRANT SELECT ON category_tax_rules TO authenticated;
GRANT ALL ON category_tax_rules TO service_role;
GRANT SELECT ON product_tax_overrides TO authenticated;
GRANT ALL ON product_tax_overrides TO service_role;
GRANT SELECT ON zip_tax_cache TO authenticated;
GRANT ALL ON zip_tax_cache TO service_role;

-- Stripe/Payout internals
GRANT SELECT ON stripe_payout_events TO authenticated;
GRANT ALL ON stripe_payout_events TO service_role;
GRANT SELECT ON stripe_disputes TO authenticated;
GRANT ALL ON stripe_disputes TO service_role;

-- Audit/status logs
GRANT SELECT ON order_status_log TO authenticated;
GRANT ALL ON order_status_log TO service_role;
GRANT SELECT ON dispute_admin_views TO authenticated;
GRANT ALL ON dispute_admin_views TO service_role;
GRANT SELECT ON profile_audit_log TO authenticated;
GRANT ALL ON profile_audit_log TO service_role;
GRANT SELECT ON user_settlements TO authenticated;
GRANT ALL ON user_settlements TO service_role;
GRANT SELECT ON market_state_blocks TO authenticated;
GRANT ALL ON market_state_blocks TO service_role;

-- CRM admin tables (admin app uses authenticated + staff RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_campaigns TO authenticated;
GRANT ALL ON crm_campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_campaign_sends TO authenticated;
GRANT ALL ON crm_campaign_sends TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_audiences TO authenticated;
GRANT ALL ON crm_audiences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_audience_functions TO authenticated;
GRANT ALL ON crm_audience_functions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_assets TO authenticated;
GRANT ALL ON crm_assets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_promotions TO authenticated;
GRANT ALL ON crm_promotions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_promo_giveaways TO authenticated;
GRANT ALL ON crm_promo_giveaways TO service_role;
GRANT SELECT, INSERT, UPDATE ON crm_promo_enrollments TO authenticated;
GRANT ALL ON crm_promo_enrollments TO service_role;
GRANT SELECT ON crm_recurring_user_incentives_blueprint TO authenticated;
GRANT ALL ON crm_recurring_user_incentives_blueprint TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_sequences TO authenticated;
GRANT ALL ON crm_sequences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_sequence_enrollments TO authenticated;
GRANT ALL ON crm_sequence_enrollments TO service_role;
GRANT SELECT ON crm_data_sources TO authenticated;
GRANT ALL ON crm_data_sources TO service_role;
GRANT SELECT ON crm_user_metadata TO authenticated;
GRANT ALL ON crm_user_metadata TO service_role;

-- OFN tables (only edge functions access)
GRANT ALL ON ofn_enterprises TO service_role;
GRANT ALL ON ofn_product_cache TO service_role;

-- Quarantine bot
GRANT SELECT ON quarantine_zones TO authenticated;
GRANT ALL ON quarantine_zones TO service_role;
GRANT SELECT ON quarantine_pest_categories TO authenticated;
GRANT ALL ON quarantine_pest_categories TO service_role;
GRANT SELECT ON quarantine_bot_health TO authenticated;
GRANT ALL ON quarantine_bot_health TO service_role;

-- Notification logs
GRANT SELECT ON sms_notification_log TO authenticated;
GRANT ALL ON sms_notification_log TO service_role;
GRANT SELECT ON push_notification_log TO authenticated;
GRANT ALL ON push_notification_log TO service_role;

-- Provider/redemption internals
GRANT SELECT ON provider_accounts TO authenticated;
GRANT ALL ON provider_accounts TO service_role;
GRANT SELECT ON provider_transactions TO authenticated;
GRANT ALL ON provider_transactions TO service_role;

-- Financial buckets
GRANT SELECT ON purchased_points_buckets TO authenticated;
GRANT ALL ON purchased_points_buckets TO service_role;
GRANT SELECT ON point_bucket_consumptions TO authenticated;
GRANT ALL ON point_bucket_consumptions TO service_role;
GRANT SELECT ON manual_refund_checks TO authenticated;
GRANT ALL ON manual_refund_checks TO service_role;
GRANT SELECT ON small_balance_refund_thresholds TO authenticated;
GRANT ALL ON small_balance_refund_thresholds TO service_role;

-- Beta testers
GRANT SELECT ON beta_testers TO authenticated;
GRANT ALL ON beta_testers TO service_role;

-- Buyer notifications
GRANT SELECT ON buyer_product_notifications TO authenticated;
GRANT ALL ON buyer_product_notifications TO service_role;

-- Feedback internals
GRANT SELECT ON feedback_status_history TO authenticated;
GRANT ALL ON feedback_status_history TO service_role;
GRANT SELECT ON feedback_comment_media TO authenticated;
GRANT ALL ON feedback_comment_media TO service_role;

-- Campaign rewards
GRANT SELECT ON campaign_rewards TO authenticated;
GRANT ALL ON campaign_rewards TO service_role;


-- ============================================================================
-- PART 6: Default privileges for FUTURE tables
-- This ensures any new tables created in future migrations also get grants.
-- ============================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- NOTE: We intentionally do NOT grant default privileges to anon.
-- Each new table that needs anon access must be explicitly granted.
