-- Add allow_existing_users to crm_campaigns
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS allow_existing_users BOOLEAN NOT NULL DEFAULT false;

-- Update the RPC to return this flag
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
    'allow_existing_users', c.allow_existing_users,
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
        'start_date', b.start_date
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
