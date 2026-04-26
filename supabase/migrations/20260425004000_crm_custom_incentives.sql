-- Add generalized fields for dynamic landing pages
ALTER TABLE crm_promotions ADD COLUMN IF NOT EXISTS custom_incentives JSONB DEFAULT '[]'::jsonb;
ALTER TABLE crm_landing_pages ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

-- Update the RPC to expose these generalized fields
CREATE OR REPLACE FUNCTION crm_get_landing_page_promotion(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description_html', p.description_html,
    'enrollment_deadline', p.enrollment_deadline,
    'custom_incentives', p.custom_incentives,
    'hero_image_url', lp.hero_image_url,
    'giveaway', (
      SELECT jsonb_build_object(
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
