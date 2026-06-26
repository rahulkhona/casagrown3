-- Allow staff members to select all market_orders for metrics/analytics
DO $$ BEGIN
  CREATE POLICY "Staff can read all market_orders" ON public.market_orders
    FOR SELECT TO authenticated
    USING (public.is_staff(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
