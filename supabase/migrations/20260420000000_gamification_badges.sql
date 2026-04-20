-- ==========================================================================
-- Migration: Gamification Badges & Kudos System
--
-- Creates the badge, kudos, and feature flag infrastructure for the
-- CasaGrown gamification system.
-- ==========================================================================

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Feature Flags
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feature_flags (
    flag_key    TEXT PRIMARY KEY,
    is_enabled  BOOLEAN NOT NULL DEFAULT false,
    metadata    JSONB DEFAULT '{}',
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.feature_flags OWNER TO postgres;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Everyone can read flags; only service_role can write
CREATE POLICY "feature_flags_public_read" ON public.feature_flags
    FOR SELECT USING (true);

GRANT SELECT ON TABLE public.feature_flags TO anon;
GRANT SELECT ON TABLE public.feature_flags TO authenticated;
GRANT ALL ON TABLE public.feature_flags TO service_role;

-- Seed the gamification flag (disabled by default)
INSERT INTO public.feature_flags (flag_key, is_enabled, metadata)
VALUES ('gamification', false, '{"description": "Badges, kudos, and fee discounts"}')
ON CONFLICT (flag_key) DO NOTHING;

-- Helper function
CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_flag_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.feature_flags WHERE flag_key = p_flag_key),
    false
  );
$$;

ALTER FUNCTION public.is_feature_enabled(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(TEXT) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Badge Type Enum & Definitions
-- ══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.badge_type AS ENUM (
    'pioneer',
    'community_founder',
    'maven',
    'veteran',
    'beginner',
    'kudos_given',
    'kudos_received'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.badge_definitions (
    badge_key       public.badge_type PRIMARY KEY,
    display_name    TEXT NOT NULL,
    description     TEXT NOT NULL,
    svg_icon        TEXT NOT NULL DEFAULT '',
    color_primary   TEXT NOT NULL DEFAULT '#16a34a',
    color_secondary TEXT NOT NULL DEFAULT '#ffffff',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.badge_definitions OWNER TO postgres;
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badge_definitions_public_read" ON public.badge_definitions
    FOR SELECT USING (true);

GRANT SELECT ON TABLE public.badge_definitions TO anon;
GRANT SELECT ON TABLE public.badge_definitions TO authenticated;
GRANT ALL ON TABLE public.badge_definitions TO service_role;

-- Seed badge definitions
INSERT INTO public.badge_definitions (badge_key, display_name, description, color_primary, sort_order) VALUES
    ('pioneer',            'Pioneer',            'One of the first 1,000 members on CasaGrown',           '#D4A843', 1),
    ('community_founder',  'Community Founder',   'Invited 50+ members who signed up',                    '#047857', 2),
    ('maven',              'Maven',              'Invited 10+ members who signed up',                     '#7C3AED', 3),
    ('veteran',            'Veteran',            'Completed 25+ marketplace activities',                   '#15803D', 4),
    ('beginner',           'Beginner',           'Completed 10+ marketplace activities',                   '#22C55E', 5),
    ('kudos_given',        'Kudos Given',        'Total kudos given to community members',                 '#F97316', 6),
    ('kudos_received',     'Kudos Received',     'Total kudos received from community members',            '#0D9488', 7)
ON CONFLICT (badge_key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Badge Rules (configurable thresholds)
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.badge_rules (
    id              SERIAL PRIMARY KEY,
    badge_key       public.badge_type NOT NULL REFERENCES public.badge_definitions(badge_key),
    rule_type       TEXT NOT NULL CHECK (rule_type IN (
        'signup_rank',       -- pioneer: signup ordinality
        'referral_count',    -- community_founder & maven: invited N users who signed up
        'activity_count'     -- veteran/beginner: listings + orders + kudos_equivalent
    )),
    threshold_value INTEGER NOT NULL,
    fee_discount_pct NUMERIC(5,4) DEFAULT 0,        -- e.g. 0.5000 = 50% discount
    referral_commission_pct NUMERIC(5,4) DEFAULT 0,  -- e.g. 0.0100 = 1% commission
    metadata        JSONB DEFAULT '{}',
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(badge_key, rule_type)
);

ALTER TABLE public.badge_rules OWNER TO postgres;
ALTER TABLE public.badge_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badge_rules_public_read" ON public.badge_rules
    FOR SELECT USING (true);

GRANT SELECT ON TABLE public.badge_rules TO anon;
GRANT SELECT ON TABLE public.badge_rules TO authenticated;
GRANT ALL ON TABLE public.badge_rules TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.badge_rules_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.badge_rules_id_seq TO service_role;

-- Seed rules with fee discounts and referral commissions
INSERT INTO public.badge_rules (badge_key, rule_type, threshold_value, fee_discount_pct, referral_commission_pct, metadata) VALUES
    ('pioneer',            'signup_rank',    1000, 0.5000, 0,      '{}'),
    ('community_founder',  'referral_count', 50,   0.2500, 0.0100, '{"note": "25% fee discount + 1% referral commission"}'),
    ('maven',              'referral_count', 10,   0,      0.0100, '{"note": "No fee discount, earns 1% referral commission"}'),
    ('veteran',            'activity_count', 25,   0.2500, 0,      '{"kudos_to_activity_ratio": 0.5}'),
    ('beginner',           'activity_count', 10,   0.1500, 0,      '{"kudos_to_activity_ratio": 0.5}')
ON CONFLICT (badge_key, rule_type) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. User Badges
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_badges (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_key   public.badge_type NOT NULL REFERENCES public.badge_definitions(badge_key),
    awarded_at  TIMESTAMPTZ DEFAULT now(),
    metadata    JSONB DEFAULT '{}',
    UNIQUE(user_id, badge_key)
);

ALTER TABLE public.user_badges OWNER TO postgres;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- Anyone can see badges; users can see their own
CREATE POLICY "user_badges_public_read" ON public.user_badges
    FOR SELECT USING (true);

CREATE POLICY "user_badges_service_insert" ON public.user_badges
    FOR INSERT WITH CHECK (true);

CREATE POLICY "user_badges_service_delete" ON public.user_badges
    FOR DELETE USING (true);

CREATE INDEX idx_user_badges_user_id ON public.user_badges(user_id);
CREATE INDEX idx_user_badges_badge_key ON public.user_badges(badge_key);

GRANT SELECT ON TABLE public.user_badges TO anon;
GRANT SELECT ON TABLE public.user_badges TO authenticated;
GRANT ALL ON TABLE public.user_badges TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. Kudos Transactions
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.kudos_transactions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    giver_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount          INTEGER NOT NULL CHECK (amount > 0 AND amount <= 5),
    message         TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT now(),
    month_key       TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
    CONSTRAINT no_self_kudos CHECK (giver_id != receiver_id)
);

ALTER TABLE public.kudos_transactions OWNER TO postgres;
ALTER TABLE public.kudos_transactions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all kudos
CREATE POLICY "kudos_transactions_auth_read" ON public.kudos_transactions
    FOR SELECT TO authenticated USING (true);

-- Users can insert kudos they give
CREATE POLICY "kudos_transactions_insert" ON public.kudos_transactions
    FOR INSERT TO authenticated WITH CHECK (giver_id = auth.uid());

CREATE INDEX idx_kudos_giver ON public.kudos_transactions(giver_id);
CREATE INDEX idx_kudos_receiver ON public.kudos_transactions(receiver_id);
CREATE INDEX idx_kudos_month ON public.kudos_transactions(giver_id, month_key);

GRANT SELECT, INSERT ON TABLE public.kudos_transactions TO authenticated;
GRANT ALL ON TABLE public.kudos_transactions TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. RPC: give_kudos
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.give_kudos(
    p_receiver_id UUID,
    p_amount INTEGER,
    p_message TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_giver_id UUID := auth.uid();
    v_monthly_budget INTEGER;
    v_used_this_month INTEGER;
    v_remaining INTEGER;
    v_current_month TEXT;
    v_result UUID;
BEGIN
    -- Validate feature flag
    IF NOT public.is_feature_enabled('gamification') THEN
        RETURN jsonb_build_object('error', 'Gamification is not enabled');
    END IF;

    -- Validate not self-kudos
    IF v_giver_id = p_receiver_id THEN
        RETURN jsonb_build_object('error', 'Cannot give kudos to yourself');
    END IF;

    -- Validate amount
    IF p_amount < 1 OR p_amount > 5 THEN
        RETURN jsonb_build_object('error', 'Kudos amount must be between 1 and 5');
    END IF;

    -- Determine monthly budget based on badges
    v_monthly_budget := 10; -- default
    IF EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_giver_id AND badge_key = 'community_founder') THEN
        v_monthly_budget := 30;
    ELSIF EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_giver_id AND badge_key = 'pioneer') THEN
        v_monthly_budget := 20;
    END IF;

    -- Check usage this month
    v_current_month := to_char(now(), 'YYYY-MM');
    SELECT COALESCE(SUM(amount), 0) INTO v_used_this_month
    FROM kudos_transactions
    WHERE giver_id = v_giver_id AND month_key = v_current_month;

    v_remaining := v_monthly_budget - v_used_this_month;

    IF p_amount > v_remaining THEN
        RETURN jsonb_build_object(
            'error', 'Insufficient kudos budget',
            'remaining', v_remaining,
            'budget', v_monthly_budget
        );
    END IF;

    -- Insert kudos
    INSERT INTO kudos_transactions (giver_id, receiver_id, amount, message)
    VALUES (v_giver_id, p_receiver_id, p_amount, COALESCE(p_message, ''))
    RETURNING id INTO v_result;

    RETURN jsonb_build_object(
        'success', true,
        'kudos_id', v_result,
        'remaining', v_remaining - p_amount,
        'budget', v_monthly_budget
    );
END;
$$;

ALTER FUNCTION public.give_kudos(UUID, INTEGER, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.give_kudos(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.give_kudos(UUID, INTEGER, TEXT) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. RPC: get_user_badges (with counts)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_badges(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_badges JSONB;
    v_kudos_given BIGINT;
    v_kudos_received BIGINT;
    v_referral_count BIGINT;
    v_activity_count BIGINT;
    v_signup_rank BIGINT;
    v_seller_avg NUMERIC;
    v_seller_count INTEGER;
    v_buyer_avg NUMERIC;
    v_buyer_count INTEGER;
    v_monthly_budget INTEGER;
    v_used_this_month INTEGER;
BEGIN
    -- Get role badges
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'badge_key', ub.badge_key,
            'display_name', bd.display_name,
            'description', bd.description,
            'color_primary', bd.color_primary,
            'sort_order', bd.sort_order,
            'awarded_at', ub.awarded_at,
            'metadata', ub.metadata
        ) ORDER BY bd.sort_order
    ), '[]'::jsonb)
    INTO v_badges
    FROM user_badges ub
    JOIN badge_definitions bd ON bd.badge_key = ub.badge_key
    WHERE ub.user_id = p_user_id
      AND ub.badge_key NOT IN ('kudos_given', 'kudos_received');

    -- Kudos stats
    SELECT COALESCE(SUM(amount), 0) INTO v_kudos_given
    FROM kudos_transactions WHERE giver_id = p_user_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_kudos_received
    FROM kudos_transactions WHERE receiver_id = p_user_id;

    -- Referral count
    SELECT COUNT(*) INTO v_referral_count
    FROM profiles WHERE invited_by_id = p_user_id;

    -- Activity count (completed orders as seller + listings + kudos_received/2)
    SELECT (
        COALESCE((SELECT COUNT(*) FROM market_orders WHERE seller_id = p_user_id AND status = 'completed'), 0) +
        COALESCE((SELECT COUNT(*) FROM market_products mp JOIN market_booths mb ON mb.id = mp.booth_id WHERE mb.owner_id = p_user_id), 0) +
        COALESCE(v_kudos_received / 2, 0)
    ) INTO v_activity_count;

    -- Signup rank
    SELECT rank INTO v_signup_rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rank
        FROM profiles
    ) ranked
    WHERE ranked.id = p_user_id;

    -- Ratings
    SELECT COALESCE(seller_avg_rating, 0), COALESCE(seller_rating_count, 0),
           COALESCE(buyer_avg_rating, 0), COALESCE(buyer_rating_count, 0)
    INTO v_seller_avg, v_seller_count, v_buyer_avg, v_buyer_count
    FROM profiles WHERE id = p_user_id;

    -- Monthly budget
    v_monthly_budget := 10;
    IF EXISTS (SELECT 1 FROM user_badges WHERE user_id = p_user_id AND badge_key = 'community_founder') THEN
        v_monthly_budget := 30;
    ELSIF EXISTS (SELECT 1 FROM user_badges WHERE user_id = p_user_id AND badge_key = 'pioneer') THEN
        v_monthly_budget := 20;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_used_this_month
    FROM kudos_transactions
    WHERE giver_id = p_user_id AND month_key = to_char(now(), 'YYYY-MM');

    RETURN jsonb_build_object(
        'badges', v_badges,
        'kudos_given', v_kudos_given,
        'kudos_received', v_kudos_received,
        'referral_count', v_referral_count,
        'activity_count', v_activity_count,
        'signup_rank', v_signup_rank,
        'seller_rating', jsonb_build_object('avg', v_seller_avg, 'count', v_seller_count),
        'buyer_rating', jsonb_build_object('avg', v_buyer_avg, 'count', v_buyer_count),
        'kudos_budget', jsonb_build_object(
            'total', v_monthly_budget,
            'used', v_used_this_month,
            'remaining', v_monthly_budget - v_used_this_month
        ),
        'gamification_enabled', public.is_feature_enabled('gamification')
    );
END;
$$;

ALTER FUNCTION public.get_user_badges(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_user_badges(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_badges(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_badges(UUID) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 8. Badge Award Logic
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_and_award_badges(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_awarded TEXT[] := '{}';
    v_referral_count BIGINT;
    v_activity_count BIGINT;
    v_signup_rank BIGINT;
    v_kudos_received BIGINT;
    v_pioneer_threshold INTEGER;
    v_founder_threshold INTEGER;
    v_maven_threshold INTEGER;
    v_veteran_threshold INTEGER;
    v_beginner_threshold INTEGER;
BEGIN
    -- Skip if gamification not enabled
    IF NOT public.is_feature_enabled('gamification') THEN
        RETURN jsonb_build_object('awarded', '[]'::jsonb, 'enabled', false);
    END IF;

    -- Load thresholds from badge_rules
    SELECT threshold_value INTO v_pioneer_threshold
    FROM badge_rules WHERE badge_key = 'pioneer' AND rule_type = 'signup_rank';
    v_pioneer_threshold := COALESCE(v_pioneer_threshold, 1000);

    SELECT threshold_value INTO v_founder_threshold
    FROM badge_rules WHERE badge_key = 'community_founder' AND rule_type = 'referral_count';
    v_founder_threshold := COALESCE(v_founder_threshold, 50);

    SELECT threshold_value INTO v_maven_threshold
    FROM badge_rules WHERE badge_key = 'maven' AND rule_type = 'referral_count';
    v_maven_threshold := COALESCE(v_maven_threshold, 10);

    SELECT threshold_value INTO v_veteran_threshold
    FROM badge_rules WHERE badge_key = 'veteran' AND rule_type = 'activity_count';
    v_veteran_threshold := COALESCE(v_veteran_threshold, 25);

    SELECT threshold_value INTO v_beginner_threshold
    FROM badge_rules WHERE badge_key = 'beginner' AND rule_type = 'activity_count';
    v_beginner_threshold := COALESCE(v_beginner_threshold, 10);

    -- Calculate user stats
    SELECT COUNT(*) INTO v_referral_count
    FROM profiles WHERE invited_by_id = p_user_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_kudos_received
    FROM kudos_transactions WHERE receiver_id = p_user_id;

    SELECT (
        COALESCE((SELECT COUNT(*) FROM market_orders WHERE seller_id = p_user_id AND status = 'completed'), 0) +
        COALESCE((SELECT COUNT(*) FROM market_products mp JOIN market_booths mb ON mb.id = mp.booth_id WHERE mb.owner_id = p_user_id), 0) +
        COALESCE(v_kudos_received / 2, 0)
    ) INTO v_activity_count;

    SELECT rank INTO v_signup_rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rank
        FROM profiles
    ) ranked
    WHERE ranked.id = p_user_id;

    -- Award Pioneer
    IF v_signup_rank <= v_pioneer_threshold THEN
        INSERT INTO user_badges (user_id, badge_key, metadata)
        VALUES (p_user_id, 'pioneer', jsonb_build_object('signup_rank', v_signup_rank))
        ON CONFLICT (user_id, badge_key) DO NOTHING;
        IF FOUND THEN v_awarded := array_append(v_awarded, 'pioneer'); END IF;
    END IF;

    -- Award Community Founder (50+ referrals)
    IF v_referral_count >= v_founder_threshold THEN
        INSERT INTO user_badges (user_id, badge_key, metadata)
        VALUES (p_user_id, 'community_founder', jsonb_build_object('referral_count', v_referral_count))
        ON CONFLICT (user_id, badge_key) DO NOTHING;
        IF FOUND THEN v_awarded := array_append(v_awarded, 'community_founder'); END IF;
    END IF;

    -- Award Maven (10+ referrals)
    IF v_referral_count >= v_maven_threshold THEN
        INSERT INTO user_badges (user_id, badge_key, metadata)
        VALUES (p_user_id, 'maven', jsonb_build_object('referral_count', v_referral_count))
        ON CONFLICT (user_id, badge_key) DO NOTHING;
        IF FOUND THEN v_awarded := array_append(v_awarded, 'maven'); END IF;
    END IF;

    -- Award Veteran (25+ activity)
    IF v_activity_count >= v_veteran_threshold THEN
        -- Revoke beginner if they have it (upgrade)
        DELETE FROM user_badges WHERE user_id = p_user_id AND badge_key = 'beginner';

        INSERT INTO user_badges (user_id, badge_key, metadata)
        VALUES (p_user_id, 'veteran', jsonb_build_object('activity_count', v_activity_count))
        ON CONFLICT (user_id, badge_key) DO NOTHING;
        IF FOUND THEN v_awarded := array_append(v_awarded, 'veteran'); END IF;

    -- Award Beginner (10+ activity, only if not already veteran)
    ELSIF v_activity_count >= v_beginner_threshold THEN
        IF NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = p_user_id AND badge_key = 'veteran') THEN
            INSERT INTO user_badges (user_id, badge_key, metadata)
            VALUES (p_user_id, 'beginner', jsonb_build_object('activity_count', v_activity_count))
            ON CONFLICT (user_id, badge_key) DO NOTHING;
            IF FOUND THEN v_awarded := array_append(v_awarded, 'beginner'); END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'awarded', to_jsonb(v_awarded),
        'stats', jsonb_build_object(
            'referral_count', v_referral_count,
            'activity_count', v_activity_count,
            'signup_rank', v_signup_rank
        )
    );
END;
$$;

ALTER FUNCTION public.check_and_award_badges(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.check_and_award_badges(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_award_badges(UUID) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 9. Updated Platform Fee with Badge Discount
-- ══════════════════════════════════════════════════════════════════════════

-- Drop the old function and recreate with badge discount logic
DROP FUNCTION IF EXISTS public.get_platform_fee_for_user(uuid, varchar);

CREATE OR REPLACE FUNCTION public.get_platform_fee_for_user(
  p_user_id uuid DEFAULT NULL,
  p_country_code varchar(3) DEFAULT NULL
)
RETURNS float AS $$
DECLARE
  v_country_code varchar(3) := 'USA';
  v_fee_rate float;
  v_max_discount float := 0;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(country_code, 'USA') INTO v_country_code
    FROM profiles
    WHERE id = p_user_id;

    IF v_country_code IS NULL THEN v_country_code := 'USA'; END IF;
  ELSIF p_country_code IS NOT NULL THEN
    v_country_code := p_country_code;
  END IF;
  
  -- Lookup the latest active fee configuration
  SELECT fees INTO v_fee_rate
  FROM platform_fees
  WHERE country_code = v_country_code
  ORDER BY creation_date DESC
  LIMIT 1;
  
  -- Fallback to 10% if config table is empty
  IF v_fee_rate IS NULL THEN
    v_fee_rate := 0.10;
  END IF;

  -- Apply badge discount if gamification is enabled and user is known
  IF p_user_id IS NOT NULL AND public.is_feature_enabled('gamification') THEN
    SELECT COALESCE(MAX(br.fee_discount_pct::float), 0) INTO v_max_discount
    FROM user_badges ub
    JOIN badge_rules br ON br.badge_key = ub.badge_key
    WHERE ub.user_id = p_user_id
      AND br.fee_discount_pct > 0;

    -- Cap discount at 60%
    v_max_discount := LEAST(v_max_discount, 0.60);
    v_fee_rate := v_fee_rate * (1 - v_max_discount);
  END IF;
  
  RETURN v_fee_rate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════════════
-- 10. Search community members for kudos
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.search_members_for_kudos(p_query TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(member ORDER BY member->>'full_name'), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT jsonb_build_object(
            'id', p.id,
            'full_name', COALESCE(p.full_name, 'Member'),
            'seller_avg_rating', COALESCE(p.seller_avg_rating, 0),
            'seller_rating_count', COALESCE(p.seller_rating_count, 0),
            'badges', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'badge_key', ub.badge_key,
                    'color_primary', bd.color_primary
                ))
                FROM user_badges ub
                JOIN badge_definitions bd ON bd.badge_key = ub.badge_key
                WHERE ub.user_id = p.id
                  AND ub.badge_key NOT IN ('kudos_given', 'kudos_received')
            ), '[]'::jsonb)
        ) as member
        FROM profiles p
        WHERE p.id != auth.uid()
          AND (
            p_query = '' OR
            p.full_name ILIKE '%' || p_query || '%'
          )
        LIMIT 20
    ) members;

    RETURN v_result;
END;
$$;

ALTER FUNCTION public.search_members_for_kudos(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.search_members_for_kudos(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_members_for_kudos(TEXT) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 11. Get recent kudos activity
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_recent_kudos(p_limit INTEGER DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(activity ORDER BY activity->>'created_at' DESC), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT jsonb_build_object(
            'id', kt.id,
            'giver_name', COALESCE(gp.full_name, 'Member'),
            'receiver_name', COALESCE(rp.full_name, 'Member'),
            'amount', kt.amount,
            'message', kt.message,
            'created_at', kt.created_at
        ) as activity
        FROM kudos_transactions kt
        JOIN profiles gp ON gp.id = kt.giver_id
        JOIN profiles rp ON rp.id = kt.receiver_id
        ORDER BY kt.created_at DESC
        LIMIT p_limit
    ) activities;

    RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_recent_kudos(INTEGER) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_recent_kudos(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_kudos(INTEGER) TO service_role;
