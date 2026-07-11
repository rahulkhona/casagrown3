CREATE OR REPLACE FUNCTION execute_generic_query(p_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Block any write operations
  IF p_query ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY)\b' THEN
    RAISE EXCEPTION 'Query contains forbidden operation. Only SELECT queries are allowed.';
  END IF;

  -- Execute the dynamic query and aggregate results as JSON
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || p_query || ') t' INTO result;
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
