-- Add is_capacity_reached boolean to crm_get_landing_page_promotion

CREATE OR REPLACE FUNCTION public.crm_get_landing_page_promotion(p_slug text, p_promo_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT CASE WHEN p.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description_html', p.description_html,
      'enrollment_deadline', p.enrollment_deadline,
      'hero_image_url', lp.hero_image_url,
      'allow_existing_users', p.allow_existing_users,
      'is_capacity_reached', (p.current_enrollees >= p.max_enrollees),
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
$function$;
