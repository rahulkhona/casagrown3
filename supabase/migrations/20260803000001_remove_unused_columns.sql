-- ============================================================================
-- Migration: Clean up unused columns and add documentation tags
--
-- Actions:
--   1. DROP converted_user_id from crm_leads (never populated, FK overhead)
--   2. DROP the index on converted_user_id
--   3. Tighten crm_leads.status CHECK to remove 'converted' (no code uses it)
--   4. Tag unused/write-only columns with @unused / @write_only comments
--      so AI tools and linters skip them in query generation
--
-- Columns explicitly KEPT (do not drop):
--   - crm_leads.landing_page_id    → needed for promo campaign tracking
--   - crm_leads.device_type        → should be captured, just not wired yet
--   - crm_leads.has_backyard       → set by funnel_processor (write-only)
--   - crm_leads.produce_interests  → set by funnel_processor
--   - crm_leads.ip_address         → set by funnel_processor
--   - crm_leads.referring_user_id  → reserved for referral tracking
--   - crm_leads.notes              → reserved for staff CRM notes
--   - All profiles columns          → documented only, not dropped
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Drop converted_user_id column and its index
-- ═══════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_crm_leads_converted;

ALTER TABLE crm_leads DROP COLUMN IF EXISTS converted_user_id;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Tighten status CHECK — remove 'converted' (no code ever transitions to it)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_status_check;
ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_status_check
  CHECK (status IN ('new', 'contacted', 'archived'));


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Tag unused / write-only crm_leads columns
-- ═══════════════════════════════════════════════════════════════════════════════
-- Convention: @unused = column exists but no code reads or writes it
--             @write_only = column is written but never queried

COMMENT ON COLUMN crm_leads.status IS '@unused — Only ever set to ''new''. No code transitions to ''contacted'' or ''archived'' yet. Lead lifecycle: new → contacted → archived.';
COMMENT ON COLUMN crm_leads.device_type IS '@unused — Should be captured but is not currently set by any code. Device type: mobile, desktop, or tablet.';
COMMENT ON COLUMN crm_leads.landing_page_id IS '@unused — Not currently set. Will be needed for promo campaign landing page tracking. FK → crm_landing_pages.id.';
COMMENT ON COLUMN crm_leads.has_backyard IS '@write_only — Set by funnel processor but never queried. Whether the lead has a backyard. Available for future audience segmentation.';
COMMENT ON COLUMN crm_leads.referring_user_id IS '@unused — Not currently populated. FK → profiles.id — should be set when a registered user referral leads to a new lead capture.';
COMMENT ON COLUMN crm_leads.notes IS '@unused — Not currently used. Internal staff notes about the lead.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Tag unused profiles columns (document only — do NOT drop)
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN profiles.payout_verification_sent_at IS '@unused — Not currently implemented. When payout identity verification email was sent.';
COMMENT ON COLUMN profiles.payout_verification_attempts IS '@unused — Not currently implemented. Number of payout verification attempts.';
COMMENT ON COLUMN profiles.tos_reminder_sent_at IS '@unused — Should be used for follow-up emails when user drops off. Timestamp when TOS reminder was sent.';
COMMENT ON COLUMN profiles.profile_reminder_sent_at IS '@unused — Not currently implemented. Timestamp when profile completion reminder was sent.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Fix metrics_crm_lead_funnel — replace converted_user_id with JOIN
--    Conversion is now derived by matching crm_leads.email → profiles.email
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION metrics_crm_lead_funnel(
  p_start TEXT,
  p_end   TEXT
)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'page_visits',    (SELECT COUNT(*) FROM crm_page_visits WHERE visited_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ),
    'form_starts',    (SELECT COUNT(*) FROM crm_page_events WHERE event_type = 'form_start' AND occurred_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ),
    'form_abandons',  (SELECT COUNT(*) FROM crm_page_events WHERE event_type = 'form_abandon' AND occurred_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ),
    'leads_captured', (SELECT COUNT(*) FROM crm_leads WHERE created_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ),
    'leads_converted',(SELECT COUNT(*) FROM crm_leads l WHERE l.created_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ AND EXISTS (SELECT 1 FROM profiles p WHERE p.email = l.email)),
    'by_source', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT
          COALESCE(l.source_platform, 'direct') AS source,
          COUNT(*)                               AS leads,
          SUM(CASE WHEN EXISTS (SELECT 1 FROM profiles p WHERE p.email = l.email) THEN 1 ELSE 0 END) AS converted
        FROM crm_leads l
        WHERE l.created_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ
        GROUP BY l.source_platform ORDER BY leads DESC
      ) t
    ), '[]')
  );
$$;
