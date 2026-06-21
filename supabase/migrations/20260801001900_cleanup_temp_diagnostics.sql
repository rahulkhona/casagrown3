-- Cleanup temporary diagnostic functions created during staging troubleshooting
DROP FUNCTION IF EXISTS public.get_cron_job_runs();
DROP FUNCTION IF EXISTS public.get_cron_job_runs(TEXT);
DROP FUNCTION IF EXISTS public.get_net_responses();
DROP FUNCTION IF EXISTS public.get_net_tables();
DROP FUNCTION IF EXISTS public.get_net_columns();
DROP FUNCTION IF EXISTS public.get_net_requests();
DROP FUNCTION IF EXISTS public.get_net_req_columns();
DROP FUNCTION IF EXISTS public.get_net_responses_by_content(TEXT);
