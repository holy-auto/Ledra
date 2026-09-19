-- ============================================================
-- Field Test Jobs / Conditions / Condition Checks
-- ============================================================
-- メーカーから施工店への案件割当、施工条件定義とチェック記録。
-- ============================================================

-- ---- ft_jobs (案件割当) ----
CREATE TABLE IF NOT EXISTS ft_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES ft_projects(id) ON DELETE CASCADE,
  manufacturer_id     UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_code            TEXT,
  title               TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'assigned'
                      CHECK (status IN ('assigned','in_progress','evidence_submitted','inspection','completed','rejected')),
  conditions_snapshot JSONB NOT NULL DEFAULT '{}',
  assigned_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ft_jobs_project_status
  ON ft_jobs (project_id, status);
CREATE INDEX IF NOT EXISTS idx_ft_jobs_mfr
  ON ft_jobs (manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_ft_jobs_tenant
  ON ft_jobs (tenant_id);

ALTER TABLE ft_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_jobs_member_select" ON ft_jobs
  FOR SELECT USING (manufacturer_id IN (SELECT public.my_manufacturer_ids()));

CREATE TRIGGER trg_ft_jobs_updated_at
  BEFORE UPDATE ON ft_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- ft_conditions (施工条件定義) ----
CREATE TABLE IF NOT EXISTS ft_conditions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES ft_projects(id) ON DELETE CASCADE,
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  description     TEXT,
  check_type      TEXT NOT NULL DEFAULT 'boolean'
                  CHECK (check_type IN ('boolean','numeric','text','photo')),
  numeric_min     NUMERIC,
  numeric_max     NUMERIC,
  unit            TEXT,
  is_required     BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ft_conditions_project
  ON ft_conditions (project_id);

ALTER TABLE ft_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_conditions_member_select" ON ft_conditions
  FOR SELECT USING (manufacturer_id IN (SELECT public.my_manufacturer_ids()));

CREATE TRIGGER trg_ft_conditions_updated_at
  BEFORE UPDATE ON ft_conditions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- ft_condition_checks (施工条件チェック記録) ----
CREATE TABLE IF NOT EXISTS ft_condition_checks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES ft_jobs(id) ON DELETE CASCADE,
  condition_id     UUID NOT NULL REFERENCES ft_conditions(id) ON DELETE CASCADE,
  value_boolean    BOOLEAN,
  value_numeric    NUMERIC,
  value_text       TEXT,
  value_photo_path TEXT,
  checked_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, condition_id)
);

CREATE INDEX IF NOT EXISTS idx_ft_condition_checks_job
  ON ft_condition_checks (job_id);

ALTER TABLE ft_condition_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_condition_checks_select" ON ft_condition_checks
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM ft_jobs
      WHERE manufacturer_id IN (SELECT public.my_manufacturer_ids())
    )
  );
