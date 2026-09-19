-- ============================================================
-- Field Test Agreements / Training Modules / Completions
-- ============================================================
-- NDA/規約の受諾管理と、プロジェクト単位の教育モジュール。
-- ============================================================

-- ---- ft_agreements (NDA/規約) ----
CREATE TABLE IF NOT EXISTS ft_agreements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES ft_projects(id) ON DELETE CASCADE,
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agreement_type  TEXT NOT NULL CHECK (agreement_type IN ('nda','terms','other')),
  document_url    TEXT,
  document_text   TEXT,
  accepted        BOOLEAN NOT NULL DEFAULT false,
  accepted_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, tenant_id, agreement_type)
);

CREATE INDEX IF NOT EXISTS idx_ft_agreements_project
  ON ft_agreements (project_id);
CREATE INDEX IF NOT EXISTS idx_ft_agreements_mfr
  ON ft_agreements (manufacturer_id);

ALTER TABLE ft_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_agreements_member_select" ON ft_agreements
  FOR SELECT USING (manufacturer_id IN (SELECT public.my_manufacturer_ids()));

CREATE TRIGGER trg_ft_agreements_updated_at
  BEFORE UPDATE ON ft_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- ft_training_modules (教育モジュール定義) ----
CREATE TABLE IF NOT EXISTS ft_training_modules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES ft_projects(id) ON DELETE CASCADE,
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  content_url     TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_required     BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ft_training_modules_project
  ON ft_training_modules (project_id);

ALTER TABLE ft_training_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_training_modules_member_select" ON ft_training_modules
  FOR SELECT USING (manufacturer_id IN (SELECT public.my_manufacturer_ids()));

CREATE TRIGGER trg_ft_training_modules_updated_at
  BEFORE UPDATE ON ft_training_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- ft_training_completions (教育受講記録) ----
CREATE TABLE IF NOT EXISTS ft_training_completions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id    UUID NOT NULL REFERENCES ft_training_modules(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_ft_training_completions_module
  ON ft_training_completions (module_id);

ALTER TABLE ft_training_completions ENABLE ROW LEVEL SECURITY;

-- RLS: module → ft_training_modules → manufacturer_id で制御。
-- completion はメーカーメンバーとテナント双方が見える必要がある。
-- 簡易版: module JOIN で manufacturer_id を引くか、テナント自身の行。
CREATE POLICY "ft_training_completions_select" ON ft_training_completions
  FOR SELECT USING (
    module_id IN (
      SELECT id FROM ft_training_modules
      WHERE manufacturer_id IN (SELECT public.my_manufacturer_ids())
    )
  );
