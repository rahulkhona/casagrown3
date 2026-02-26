-- Migration: Create a provider_queue_status table to track circuit breaker queueing states

CREATE TABLE IF NOT EXISTS public.provider_queue_status (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    provider text NOT NULL UNIQUE CHECK (provider IN ('globalgiving', 'tremendous', 'reloadly')),
    is_queuing boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.provider_queue_status ENABLE ROW LEVEL SECURITY;

-- Admins can view and update queue status (using the staff_members table initialized in 20260220400000)
CREATE POLICY "Admins can view provider queue status"
    ON public.provider_queue_status FOR SELECT
    USING ( public.has_staff_role(auth.uid(), 'admin') );

CREATE POLICY "Admins can update provider queue status"
    ON public.provider_queue_status FOR UPDATE
    USING ( public.has_staff_role(auth.uid(), 'admin') );

-- Seed initial rows for provider tracking
INSERT INTO public.provider_queue_status (provider, is_queuing, is_active) 
VALUES 
  ('globalgiving', false, true),
  ('tremendous', false, true),
  ('reloadly', false, true)
ON CONFLICT (provider) DO NOTHING;

-- Create an RPC to rapidly fetch available redemption methods
CREATE OR REPLACE FUNCTION public.get_active_redemption_providers()
RETURNS TABLE (
    provider text,
    is_queuing boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        provider,
        is_queuing
    FROM public.provider_queue_status 
    WHERE is_active = true;
$$;
