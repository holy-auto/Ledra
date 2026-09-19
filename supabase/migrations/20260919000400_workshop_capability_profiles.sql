-- ============================================================
-- Workshop Capability Profiles
-- ============================================================
-- 施工店のケイパビリティ（許認可・資格・設備・対応サービス）を管理。
-- テナント単位で1レコード。メーカーが募集・審査・案件割当時に参照する。
-- ============================================================

CREATE TABLE IF NOT EXISTS workshop_capability_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- 許認可 (例: [{type: "認証工場", number: "xxx", expires_at: "2027-01-01"}])
  permits                 JSONB NOT NULL DEFAULT '[]',

  -- 整備士資格 (例: [{grade: "2級ガソリン", holder_name: "田中", cert_number: "xxx"}])
  mechanic_certifications JSONB NOT NULL DEFAULT '[]',

  -- 設備
  has_lift                BOOLEAN NOT NULL DEFAULT false,
  has_diagnostic_tools    BOOLEAN NOT NULL DEFAULT false,
  has_adas_equipment      BOOLEAN NOT NULL DEFAULT false,
  equipment_notes         TEXT,

  -- サービスケイパビリティ
  ev_capable              BOOLEAN NOT NULL DEFAULT false,
  body_work               BOOLEAN NOT NULL DEFAULT false,
  painting                BOOLEAN NOT NULL DEFAULT false,
  coating                 BOOLEAN NOT NULL DEFAULT false,
  ppf                     BOOLEAN NOT NULL DEFAULT false,
  electrical              BOOLEAN NOT NULL DEFAULT false,
  mobile_service          BOOLEAN NOT NULL DEFAULT false,

  -- 対応車種 (例: ["国産全般", "輸入車", "大型"])
  supported_vehicles      JSONB NOT NULL DEFAULT '[]',

  -- 対応エリア (例: {prefectures: ["東京都","神奈川県"], radius_km: 50, notes: "首都圏全域"})
  service_area            JSONB NOT NULL DEFAULT '{}',

  -- 検証済みフラグ（メーカーが確認した日時）
  verified_at             TIMESTAMPTZ,
  verified_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_workshop_cap_profiles_tenant
  ON workshop_capability_profiles (tenant_id);

ALTER TABLE workshop_capability_profiles ENABLE ROW LEVEL SECURITY;

-- 施工店の業務能力は秘匿情報ではないため、認証済みユーザーは参照可能
CREATE POLICY "workshop_cap_profiles_auth_select" ON workshop_capability_profiles
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_workshop_cap_profiles_updated_at
  BEFORE UPDATE ON workshop_capability_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
