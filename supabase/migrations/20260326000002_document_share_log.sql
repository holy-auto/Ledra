CREATE TABLE IF NOT EXISTS document_share_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'line', 'sms')),
  recipient text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text DEFAULT 'sent',
  error_message text,
  sent_by uuid
);

CREATE INDEX IF NOT EXISTS idx_doc_share_log_doc ON document_share_log(document_id);

ALTER TABLE document_share_log ENABLE ROW LEVEL SECURITY;
