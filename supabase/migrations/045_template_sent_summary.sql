CREATE OR REPLACE FUNCTION template_sent_summary(p_phones TEXT[])
RETURNS TABLE (phone_normalized TEXT, template_name TEXT, last_sent_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT l.phone_normalized, l.template_name, max(l.sent_at)
  FROM template_send_log l
  WHERE l.phone_normalized = ANY(p_phones)
  GROUP BY l.phone_normalized, l.template_name;
$$;

GRANT EXECUTE ON FUNCTION template_sent_summary(TEXT[]) TO authenticated;
