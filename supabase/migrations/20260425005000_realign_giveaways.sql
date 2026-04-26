-- Realign Giveaways: Add title and description to crm_promo_giveaways
ALTER TABLE crm_promo_giveaways ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE crm_promo_giveaways ADD COLUMN IF NOT EXISTS description TEXT;

-- Drop the custom_incentives workaround
ALTER TABLE crm_promotions DROP COLUMN IF EXISTS custom_incentives;

-- Update the RPC to use the new fields
CREATE OR REPLACE FUNCTION crm_get_landing_page_promotion(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description_html', p.description_html,
    'enrollment_deadline', p.enrollment_deadline,
    'hero_image_url', lp.hero_image_url,
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
        'frequency', b.frequency,
        'occurrences', b.occurrences
      )
      FROM crm_recurring_user_incentives_blueprint b
      WHERE b.promotion_id = p.id
    )
  )
  FROM crm_landing_pages lp
  JOIN crm_campaigns c ON c.id = lp.campaign_id
  JOIN crm_promotions p ON p.id = c.promotion_id
  WHERE lp.slug = p_slug
    AND lp.is_active = TRUE;
$$;
