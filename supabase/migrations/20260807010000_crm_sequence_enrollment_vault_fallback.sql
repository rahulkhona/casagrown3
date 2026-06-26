-- Migration: Redefine call_enroll_in_sequence to use invoke_edge_function with vault fallback
CREATE OR REPLACE FUNCTION public.call_enroll_in_sequence(p_sequence_id uuid, p_recipients jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  -- Skip if no recipients
  IF p_recipients IS NULL OR jsonb_array_length(p_recipients) = 0 THEN
    RETURN;
  END IF;

  PERFORM public.invoke_edge_function(
    'enroll-in-sequence',
    jsonb_build_object(
      'sequence_id', p_sequence_id,
      'recipients',  p_recipients
    )
  );
END;
$$;
