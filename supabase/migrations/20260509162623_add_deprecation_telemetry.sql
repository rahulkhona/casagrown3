-- Create obsolete_usage_logs table
CREATE TABLE IF NOT EXISTS public.obsolete_usage_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type text NOT NULL CHECK (object_type IN ('table', 'function', 'ui', 'edge_function')),
    object_name text NOT NULL,
    referenced_at timestamptz NOT NULL DEFAULT now(),
    details jsonb
);

-- Create obsolete_cleanup_logs table
CREATE TABLE IF NOT EXISTS public.obsolete_cleanup_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cleared_at timestamptz NOT NULL DEFAULT now(),
    rows_deleted integer NOT NULL
);

-- Enable RLS
ALTER TABLE public.obsolete_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obsolete_cleanup_logs ENABLE ROW LEVEL SECURITY;

-- Allow insert from anon/auth for UI/Edge functions (via RPC)
-- but prevent manual selects except for service_role
CREATE POLICY "Allow anyone to insert obsolete_usage_logs" ON public.obsolete_usage_logs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow service_role to manage obsolete_usage_logs" ON public.obsolete_usage_logs USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role to manage obsolete_cleanup_logs" ON public.obsolete_cleanup_logs USING (true) WITH CHECK (true);

-- Create RPC for UI / Edge Functions to log
CREATE OR REPLACE FUNCTION public.log_obsolete_ui_usage(p_object_type text, p_object_name text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.obsolete_usage_logs (object_type, object_name, details)
    VALUES (p_object_type, p_object_name, p_details);
END;
$$;

-- Create generic trigger function
CREATE OR REPLACE FUNCTION public.log_obsolete_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.obsolete_usage_logs (object_type, object_name, details)
    VALUES ('table', TG_TABLE_NAME, jsonb_build_object('operation', TG_OP));
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;



-- Create purge function
CREATE OR REPLACE FUNCTION public.purge_old_obsolete_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count integer;
BEGIN
    WITH deleted AS (
        DELETE FROM public.obsolete_usage_logs
        WHERE referenced_at < now() - interval '30 days'
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_count FROM deleted;

    IF v_deleted_count > 0 THEN
        INSERT INTO public.obsolete_cleanup_logs (rows_deleted) VALUES (v_deleted_count);
    END IF;
END;
$$;

-- Schedule cron job
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pg_cron'
    ) THEN
        PERFORM cron.schedule('purge-obsolete-logs', '0 2 * * *', 'SELECT purge_old_obsolete_logs()');
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Failed to schedule cron job for purge-obsolete-logs: %', SQLERRM;
END $$;
