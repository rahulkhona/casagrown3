CREATE TABLE crm_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  trigger_event TEXT,
  definition JSONB NOT NULL DEFAULT '{"nodes": [], "edges": [], "startNodeId": null}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crm_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id UUID REFERENCES crm_sequences(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL,
  recipient_id UUID NOT NULL,
  current_node_id TEXT,
  next_evaluation_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sequence_id, recipient_type, recipient_id)
);

ALTER TABLE crm_campaign_sends ADD COLUMN sequence_id UUID REFERENCES crm_sequences(id) ON DELETE SET NULL;
ALTER TABLE crm_campaign_sends ADD COLUMN node_id TEXT;

-- RLS for sequences
ALTER TABLE crm_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on crm_sequences" ON crm_sequences FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin')) WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin'));

-- RLS for enrollments
ALTER TABLE crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on crm_sequence_enrollments" ON crm_sequence_enrollments FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin')) WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin'));
