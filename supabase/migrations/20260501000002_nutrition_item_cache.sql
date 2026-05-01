-- ============================================================================
-- Create: nutrition_item_cache
-- Purpose: Global per-item cache for AI-generated nutrition loss estimates
--          to avoid duplicate Gemini LLM calls across different users.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nutrition_item_cache (
    name TEXT PRIMARY KEY,
    time_to_shelf TEXT NOT NULL,
    nutrient_loss_pct TEXT NOT NULL,
    impacted_nutrients TEXT NOT NULL,
    evidence_link TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS but restrict all public access
ALTER TABLE public.nutrition_item_cache ENABLE ROW LEVEL SECURITY;

-- Allow service role full access to insert/upsert/select
CREATE POLICY "Service role can manage nutrition item cache"
    ON public.nutrition_item_cache
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
