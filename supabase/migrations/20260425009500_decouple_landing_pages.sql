-- Decouple Landing Pages from rigid 1:1 Campaign/Promotion mappings
-- Allow multiple promotions to share a single canonical landing page

ALTER TABLE crm_promotions 
  ADD COLUMN IF NOT EXISTS landing_page_id UUID REFERENCES crm_landing_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allow_existing_users BOOLEAN NOT NULL DEFAULT true;

-- Ensure existing promotions mapped through campaigns get a landing_page_id assigned
UPDATE crm_promotions p
SET landing_page_id = lp.id,
    allow_existing_users = c.allow_existing_users
FROM crm_campaigns c
JOIN crm_landing_pages lp ON lp.campaign_id = c.id
WHERE c.promotion_id = p.id
  AND p.landing_page_id IS NULL;

-- Rewrite the RPC to dynamically look up the canonical landing page slug,
-- and optionally fetch a specific promotion ID.
-- If no promotion ID is provided, it falls back to the most recent promotion for that landing page.
DROP FUNCTION IF EXISTS public.crm_get_landing_page_promotion(TEXT);

CREATE OR REPLACE FUNCTION public.crm_get_landing_page_promotion(p_slug TEXT, p_promo_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT CASE WHEN p.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description_html', p.description_html,
      'enrollment_deadline', p.enrollment_deadline,
      'hero_image_url', lp.hero_image_url,
      'allow_existing_users', p.allow_existing_users,
      'giveaway', (
        SELECT jsonb_build_object(
          'title', g.title,
          'description', g.description,
          'start_date', g.start_date,
          'end_date', g.end_date,
          'photos', g.photos
        )
        FROM crm_promo_giveaways g
        WHERE g.promotion_id = p.id
      ),
      'credits', (
        SELECT jsonb_build_object(
          'amount_usd', b.amount_usd,
          'credit_type', b.credit_type,
          'cap_type', b.cap_type,
          'cap_value', b.cap_value,
          'frequency', b.frequency,
          'occurrences', b.occurrences,
          'start_date', b.start_date,
          'image_url', b.image_url
        )
        FROM crm_recurring_user_incentives_blueprint b
        WHERE b.promotion_id = p.id
      )
    )
  END
  FROM crm_landing_pages lp
  LEFT JOIN crm_promotions p ON p.landing_page_id = lp.id
    AND (p_promo_id IS NULL OR p.id = p_promo_id)
  WHERE lp.slug = p_slug
    AND lp.is_active = TRUE
  ORDER BY p.created_at DESC
  LIMIT 1;
$$;
