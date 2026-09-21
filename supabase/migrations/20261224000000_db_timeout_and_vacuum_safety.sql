-- Database Connection Timeout Safety Setting
-- Prevents connection pool exhaustion by automatically terminating
-- transactions that remain idle inside an open transaction for more than 60 seconds.

-- 1. Automatically terminate any transaction that stays idle for more than 60 seconds
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '60s';

-- 2. Throttle autovacuum on high-churn tables to prevent disk I/O saturation during background sweeps
ALTER TABLE IF EXISTS public.profiles SET (autovacuum_vacuum_cost_delay = 20);
ALTER TABLE IF EXISTS public.sessions SET (autovacuum_vacuum_cost_delay = 20);
ALTER TABLE IF EXISTS public.http_request_queue SET (autovacuum_vacuum_cost_delay = 20);
ALTER TABLE IF EXISTS public.zone_pulse SET (autovacuum_vacuum_cost_delay = 20);
