CREATE TABLE IF NOT EXISTS template_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone_normalized TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_language TEXT,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_send_log_template_phone
  ON template_send_log(account_id, template_name, phone_normalized, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_template_send_log_phone
  ON template_send_log(account_id, phone_normalized, sent_at DESC);

ALTER TABLE template_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_send_log_select ON template_send_log;
DROP POLICY IF EXISTS template_send_log_insert ON template_send_log;
DROP POLICY IF EXISTS template_send_log_delete ON template_send_log;

CREATE POLICY template_send_log_select ON template_send_log FOR SELECT USING (is_account_member(account_id));
CREATE POLICY template_send_log_insert ON template_send_log FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY template_send_log_delete ON template_send_log FOR DELETE USING (is_account_member(account_id, 'agent'));

CREATE OR REPLACE FUNCTION claim_template_send(
  p_account_id UUID,
  p_template_name TEXT,
  p_template_language TEXT,
  p_phone_normalized TEXT,
  p_contact_id UUID,
  p_user_id UUID,
  p_window_minutes INTEGER DEFAULT 1440
)
RETURNS TABLE (claimed BOOLEAN, log_id UUID, last_sent_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_last TIMESTAMPTZ;
  v_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_account_id::text || '|' || p_template_name || '|' || p_phone_normalized, 0)
  );

  SELECT max(l.sent_at) INTO v_last
  FROM template_send_log l
  WHERE l.account_id = p_account_id
    AND l.template_name = p_template_name
    AND l.phone_normalized = p_phone_normalized
    AND l.sent_at > NOW() - make_interval(mins => p_window_minutes);

  IF v_last IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, v_last;
    RETURN;
  END IF;

  INSERT INTO template_send_log (
    account_id, contact_id, phone_normalized, template_name, template_language, sent_by
  ) VALUES (
    p_account_id, p_contact_id, p_phone_normalized, p_template_name, p_template_language, p_user_id
  ) RETURNING id INTO v_id;

  RETURN QUERY SELECT TRUE, v_id, NULL::TIMESTAMPTZ;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_template_send(UUID, TEXT, TEXT, TEXT, UUID, UUID, INTEGER) TO authenticated, service_role;
