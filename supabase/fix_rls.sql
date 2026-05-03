DROP POLICY IF EXISTS "Admin full access on crm_sequences" ON crm_sequences;
CREATE POLICY "Admin full access on crm_sequences" ON crm_sequences 
FOR ALL TO authenticated 
USING (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin'))
WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin full access on crm_sequence_enrollments" ON crm_sequence_enrollments;
CREATE POLICY "Admin full access on crm_sequence_enrollments" ON crm_sequence_enrollments 
FOR ALL TO authenticated 
USING (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin'))
WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin'));
