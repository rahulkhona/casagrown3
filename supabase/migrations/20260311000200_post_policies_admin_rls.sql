-- Fix: use has_staff_role() helper which is the correct pattern for admin RLS
DROP POLICY IF EXISTS "Admins can manage post type policies" ON post_type_policies;

CREATE POLICY "Admins can manage post type policies" ON post_type_policies
  FOR ALL TO authenticated
  USING (has_staff_role(auth.uid(), 'admin'))
  WITH CHECK (has_staff_role(auth.uid(), 'admin'));
