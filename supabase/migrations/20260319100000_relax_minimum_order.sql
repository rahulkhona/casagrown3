-- =============================================================================
-- Remove $5 minimum order constraint (relaxed for alpha testing)
-- Credit card fee economics can be revisited later
-- =============================================================================

-- 1. Drop product potential constraint
ALTER TABLE market_products DROP CONSTRAINT IF EXISTS chk_minimum_product_potential;

-- 2. Drop order subtotal constraint
ALTER TABLE market_orders DROP CONSTRAINT IF EXISTS chk_minimum_order_subtotal;
