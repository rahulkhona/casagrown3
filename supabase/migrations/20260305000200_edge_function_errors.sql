-- Persistent error log for edge functions.
-- Allows monitoring failures even when users don't report them.
-- Rows auto-expire after 30 days via scheduled cleanup.

CREATE TABLE IF NOT EXISTS edge_function_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  error_message text NOT NULL,
  error_stack   text,
  request_method text,
  request_path  text
);

-- Index for querying recent errors by function
CREATE INDEX IF NOT EXISTS idx_efe_fn_created
  ON edge_function_errors (function_name, created_at DESC);

-- RLS: no public access (service_role only via serveWithCors)
ALTER TABLE edge_function_errors ENABLE ROW LEVEL SECURITY;

-- Cleanup: delete errors older than 30 days (runs with existing cron if available)
-- Can also be run manually: DELETE FROM edge_function_errors WHERE created_at < now() - interval '30 days';

COMMENT ON TABLE edge_function_errors IS 'Persistent log of edge function errors for monitoring. Rows auto-expire after 30 days.';
