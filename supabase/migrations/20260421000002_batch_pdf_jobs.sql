-- batch_pdf_jobs: PDF一括生成の非同期ジョブ管理
CREATE TABLE IF NOT EXISTS batch_pdf_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  -- status: queued → processing → completed → failed
  public_ids TEXT[] NOT NULL DEFAULT '{}',
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  result_urls JSONB NOT NULL DEFAULT '[]',
  -- [{ public_id, pdf_url } | { public_id, error }]
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX batch_pdf_jobs_tenant_id_idx ON batch_pdf_jobs(tenant_id);
CREATE INDEX batch_pdf_jobs_status_idx ON batch_pdf_jobs(status);

ALTER TABLE batch_pdf_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can view their batch pdf jobs"
  ON batch_pdf_jobs FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid()
    )
  );
