-- 20260510000000_growbot_integration.sql

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add ui_actions to market_chat_messages
ALTER TABLE public.market_chat_messages
ADD COLUMN ui_actions JSONB DEFAULT '[]'::jsonb;

-- Create growbot_skills table
CREATE TABLE public.growbot_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    trigger_rules TEXT NOT NULL,
    schema_properties JSONB DEFAULT '[]'::jsonb,
    template TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create growbot_rules table
CREATE TABLE public.growbot_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_text TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create growbot_user_facts table
CREATE TABLE public.growbot_user_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    fact TEXT NOT NULL,
    embedding vector(768) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add RLS
ALTER TABLE public.growbot_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growbot_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growbot_user_facts ENABLE ROW LEVEL SECURITY;

-- growbot_skills policies
CREATE POLICY "Admins can manage growbot_skills" ON public.growbot_skills
  FOR ALL USING (has_staff_role(auth.uid(), 'admin'));
  
CREATE POLICY "Public read for growbot_skills" ON public.growbot_skills
  FOR SELECT USING (is_active = true);

-- growbot_rules policies
CREATE POLICY "Admins can manage growbot_rules" ON public.growbot_rules
  FOR ALL USING (has_staff_role(auth.uid(), 'admin'));

CREATE POLICY "Public read for growbot_rules" ON public.growbot_rules
  FOR SELECT USING (is_active = true);

-- growbot_user_facts policies
CREATE POLICY "Users can manage their own facts" ON public.growbot_user_facts
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Service roles can manage all facts" ON public.growbot_user_facts
  FOR ALL USING (true) WITH CHECK (true);

-- Vector Match RPC
CREATE OR REPLACE FUNCTION public.match_user_facts(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  fact text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    growbot_user_facts.id,
    growbot_user_facts.fact,
    1 - (growbot_user_facts.embedding <=> query_embedding) AS similarity
  FROM growbot_user_facts
  WHERE growbot_user_facts.user_id = p_user_id
    AND 1 - (growbot_user_facts.embedding <=> query_embedding) > match_threshold
  ORDER BY growbot_user_facts.embedding <=> query_embedding
  LIMIT match_count;
$$;
