-- ============================================================
-- Field Test Evidence / Inspections / Defects
-- ============================================================
-- 証拠取得、品質検査、不具合管理のテーブル群。
-- ============================================================

-- ---- ft_evidence (証拠) ----
CREATE TABLE IF NOT EXISTS ft_evidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES ft_jobs(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES ft_projects(id) ON DELETE CASCADE,
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  evidence_type   TEXT NOT NULL
                  CHECK (evidence_type IN ('photo_before','photo_during','photo_after','measurement','env_data','video','document','other')),
  file_path       TEXT,
  file_name       TEXT,
  content_type    TEXT,
  caption         TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  captured_at     TIMESTAMPTZ,
  captured_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ft_evidence_job_type
  ON ft_evidence (job_id, evidence_type);
CREATE INDEX IF NOT EXISTS idx_ft_evidence_project
  ON ft_evidence (project_id);
CREATE INDEX IF NOT EXISTS idx_ft_evidence_mfr
  ON ft_evidence (manufacturer_id);

ALTER TABLE ft_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_evidence_member_select" ON ft_evidence
  FOR SELECT USING (manufacturer_id IN (SELECT public.my_manufacturer_ids()));

-- ---- ft_inspections (品質検査) ----
CREATE TABLE IF NOT EXISTS ft_inspections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID NOT NULL REFERENCES ft_jobs(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES ft_projects(id) ON DELETE CASCADE,
  manufacturer_id   UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  inspector_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  result            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (result IN ('pending','pass','fail','conditional_pass')),
  score             NUMERIC(5,2),
  notes             TEXT,
  checklist         JSONB NOT NULL DEFAULT '[]',
  inspected_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ft_inspections_job
  ON ft_inspections (job_id);
CREATE INDEX IF NOT EXISTS idx_ft_inspections_project_result
  ON ft_inspections (project_id, result);

ALTER TABLE ft_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_inspections_member_select" ON ft_inspections
  FOR SELECT USING (manufacturer_id IN (SELECT public.my_manufacturer_ids()));

CREATE TRIGGER trg_ft_inspections_updated_at
  BEFORE UPDATE ON ft_inspections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- ft_defects (不具合管理) ----
CREATE TABLE IF NOT EXISTS ft_defects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES ft_jobs(id) ON DELETE SET NULL,
  project_id      UUID NOT NULL REFERENCES ft_projects(id) ON DELETE CASCADE,
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  defect_code     TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  severity        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (severity IN ('low','medium','high','critical')),
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','investigating','resolved','closed','wontfix')),
  resolution      TEXT,
  reported_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ft_defects_project_status
  ON ft_defects (project_id, status);
CREATE INDEX IF NOT EXISTS idx_ft_defects_mfr_severity
  ON ft_defects (manufacturer_id, severity);
CREATE INDEX IF NOT EXISTS idx_ft_defects_job
  ON ft_defects (job_id);

ALTER TABLE ft_defects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_defects_member_select" ON ft_defects
  FOR SELECT USING (manufacturer_id IN (SELECT public.my_manufacturer_ids()));

CREATE TRIGGER trg_ft_defects_updated_at
  BEFORE UPDATE ON ft_defects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
