-- ============================================================
-- Field Test Projects / Recruitments / Applications
-- ============================================================
-- メーカー向け実証テストプラットフォームの中核テーブル群。
-- ft_projects が全体の親で、募集 → 応募 → 審査のフローを支える。
-- ============================================================

-- ---- ft_projects (実証プロジェクト) ----
CREATE TABLE IF NOT EXISTS ft_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  product_name    TEXT,
  product_spec    JSONB NOT NULL DEFAULT '{}',
  budget          NUMERIC(12,0),
  target_units    INT,
  conditions      JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','recruiting','active','completed','archived')),
  starts_at       DATE,
  ends_at         DATE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ft_projects_mfr
  ON ft_projects (manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_ft_projects_mfr_status
  ON ft_projects (manufacturer_id, status);

ALTER TABLE ft_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_projects_member_select" ON ft_projects
  FOR SELECT USING (manufacturer_id IN (SELECT public.my_manufacturer_ids()));

CREATE TRIGGER trg_ft_projects_updated_at
  BEFORE UPDATE ON ft_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- ft_recruitments (施工店募集) ----
CREATE TABLE IF NOT EXISTS ft_recruitments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES ft_projects(id) ON DELETE CASCADE,
  manufacturer_id         UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  description             TEXT,
  required_certifications TEXT[] NOT NULL DEFAULT '{}',
  max_participants        INT,
  deadline                TIMESTAMPTZ,
  is_open                 BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ft_recruitments_project
  ON ft_recruitments (project_id);
CREATE INDEX IF NOT EXISTS idx_ft_recruitments_mfr_open
  ON ft_recruitments (manufacturer_id, is_open);

ALTER TABLE ft_recruitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_recruitments_member_select" ON ft_recruitments
  FOR SELECT USING (manufacturer_id IN (SELECT public.my_manufacturer_ids()));

CREATE TRIGGER trg_ft_recruitments_updated_at
  BEFORE UPDATE ON ft_recruitments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- ft_applications (応募/審査) ----
CREATE TABLE IF NOT EXISTS ft_applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruitment_id   UUID NOT NULL REFERENCES ft_recruitments(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES ft_projects(id) ON DELETE CASCADE,
  manufacturer_id  UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  applied_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','withdrawn')),
  notes            TEXT,
  review_notes     TEXT,
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recruitment_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_ft_applications_project_status
  ON ft_applications (project_id, status);
CREATE INDEX IF NOT EXISTS idx_ft_applications_mfr
  ON ft_applications (manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_ft_applications_tenant
  ON ft_applications (tenant_id);

ALTER TABLE ft_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_applications_member_select" ON ft_applications
  FOR SELECT USING (manufacturer_id IN (SELECT public.my_manufacturer_ids()));

CREATE TRIGGER trg_ft_applications_updated_at
  BEFORE UPDATE ON ft_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
