-- Migration: Fix Admin RLS Policies
-- Updates tables that were mistakenly using `user_id = auth.uid()` checks against `staff_members`
-- to correctly use the `has_staff_role(auth.uid(), 'admin')` helper function.

-- 1. sales_categories
DROP POLICY IF EXISTS "Admins can manage categories" ON sales_categories;
CREATE POLICY "Admins can manage categories" ON sales_categories FOR ALL TO authenticated
  USING (has_staff_role(auth.uid(), 'admin'))
  WITH CHECK (has_staff_role(auth.uid(), 'admin'));

-- 2. category_restrictions
DROP POLICY IF EXISTS "Admins can manage category restrictions" ON category_restrictions;
CREATE POLICY "Admins can manage category restrictions" ON category_restrictions FOR ALL TO authenticated
  USING (has_staff_role(auth.uid(), 'admin'))
  WITH CHECK (has_staff_role(auth.uid(), 'admin'));

-- 3. blocked_products
DROP POLICY IF EXISTS "Admins can manage blocked products" ON blocked_products;
CREATE POLICY "Admins can manage blocked products" ON blocked_products FOR ALL TO authenticated
  USING (has_staff_role(auth.uid(), 'admin'))
  WITH CHECK (has_staff_role(auth.uid(), 'admin'));


