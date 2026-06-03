-- =============================================================================
-- 部品装着インテグリティ — Phase 1: 土台スキーマ
--
-- 設計: docs/parts-installation-integrity-design.md
--
-- 本マイグレーションが作るもの:
--   1. part_installations          … 装着イベント（どの作業で・どの車に・何を付けたか）
--   2. part_installation_evidence  … 装着に紐づく証拠（写真/伝票/旧品）追記専用
--   3. part_serial_registry        … シリアル全体横断レジストリ（個体の一回限り使用）
--   4. part_integrity_findings     … AI/ルールによる相互矛盾・異常の自動検知結果（L7）
--   5. part_confirmation_signatures… 確定＝顧客本人のOTP所持証明＋電子署名（Phase 3で本格運用）
--   + 既存テーブル拡張 (inventory_items / inventory_movements / customers)
--
-- 凍結・追記専用トリガとシリアル照合関数は後続マイグレーション
--   20260603000001_part_installations_guard.sql で定義する。
--
-- 破壊的変更なし: 既存カラムは追加のみ（すべて nullable / 既定値あり）。
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) part_installations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS part_installations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- 作業・車両・顧客との紐付け
  job_order_id            uuid REFERENCES job_orders(id) ON DELETE SET NULL,
  reservation_id          uuid REFERENCES reservations(id) ON DELETE SET NULL,
  vehicle_id              uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  customer_id             uuid REFERENCES customers(id) ON DELETE SET NULL,
  inventory_item_id       uuid REFERENCES inventory_items(id) ON DELETE SET NULL,

  -- 部品の同定
  part_name               text NOT NULL,
  gtin                    text,
  lot_code                text,
  serial_no               text,
  part_kind               text NOT NULL DEFAULT 'consumable'
                            CHECK (part_kind IN ('serialized','lot_only','consumable','high_value')),
  quantity                numeric(12,2) NOT NULL DEFAULT 1,
  unit                    text NOT NULL DEFAULT '個',
  amount_jpy              integer,  -- 税込の品目金額（単価×数量）。high_value 判定(>100,000)に使用

  -- 確定に必要な保証グレード（fail-safe: 既定は最強の customer_otp）
  required_assurance      text NOT NULL DEFAULT 'customer_otp'
                            CHECK (required_assurance IN ('customer_otp','store_contact_otp','any')),

  -- 状態機械: installed → customer_verified（確定/完全凍結） / voided（取消）
  status                  text NOT NULL DEFAULT 'installed'
                            CHECK (status IN ('installed','customer_verified','disputed','voided')),

  -- 確定（顧客本人の電子署名）
  confirmation_signature_id uuid,  -- → part_confirmation_signatures(id)。FKは署名表作成後に付与
  customer_verified_at    timestamptz,
  customer_verified_via   text,

  -- 取消（完全凍結後に許される唯一の遷移）
  void_reason             text,
  voided_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at               timestamptz,

  -- 整合性
  content_hash            text,  -- サーバ計算 SHA256(canonical_manifest)。署名対象 document_hash の素

  -- ブロックチェーンアンカー（§6.5: high_value は個別アンカー）
  polygon_tx_hash         text,
  polygon_network         text CHECK (polygon_network IS NULL OR polygon_network IN ('polygon','amoy')),

  installed_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  installed_at            timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_installations_tenant
  ON part_installations(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_part_installations_job
  ON part_installations(job_order_id) WHERE job_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_installations_vehicle
  ON part_installations(vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_installations_customer
  ON part_installations(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_installations_status
  ON part_installations(tenant_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) part_confirmation_signatures（確定署名。Phase 3 で UI/配信を本格実装）
--    既存 signature_sessions（メールリンク＋サーバ鍵署名）と電話OTPを結合する受け皿。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS part_confirmation_signatures (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id         uuid NOT NULL REFERENCES part_installations(id) ON DELETE CASCADE,

  token                   text UNIQUE,
  expires_at              timestamptz,
  channel                 text CHECK (channel IS NULL OR channel IN ('line','sms','in_store_tablet')),
  assurance               text CHECK (assurance IS NULL OR assurance IN ('customer_otp','store_contact_otp','in_store_tablet')),
  contact_provenance      text CHECK (contact_provenance IS NULL OR contact_provenance IN ('customer','store')),

  -- 署名対象（確定時点の content_hash を封入）
  document_hash           text,
  document_hash_alg       text NOT NULL DEFAULT 'SHA-256',

  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','otp_verified','signed','expired','cancelled')),

  -- 本人性の証跡（電子署名法 第2条第1号）
  otp_verified_at         timestamptz,
  signed_at               timestamptz,
  signer_ip               text,
  signer_user_agent       text,
  signer_phone_full_hash  text,   -- sha256(v1|tenant_id|E164|PEPPER)。確定照合の主キー
  signer_phone_last4_hash text,   -- 従来照合の補助
  witness_staff_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 非改ざん性（電子署名法 第2条第2号）
  signature               text,
  signing_payload         text,
  public_key_fingerprint  text,
  key_version             text,

  -- RFC3161 タイムスタンプ（国内 JIPDEC 認定TS局）
  tsa_token               bytea,
  tsa_authority           text,
  tsa_timestamp_at        timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_conf_sig_installation
  ON part_confirmation_signatures(installation_id);
CREATE INDEX IF NOT EXISTS idx_part_conf_sig_tenant
  ON part_confirmation_signatures(tenant_id);

-- part_installations.confirmation_signature_id の FK を後付け。
-- 両表とも本マイグレーションで新規作成＝既存行ゼロだが、lint 規約に従い NOT VALID で付与
-- （空テーブルなので検証スキャンは発生しない）。
ALTER TABLE part_installations
  ADD CONSTRAINT part_installations_confirmation_signature_fk
  FOREIGN KEY (confirmation_signature_id)
  REFERENCES part_confirmation_signatures(id) ON DELETE SET NULL
  NOT VALID;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) part_serial_registry（シリアル全体横断・個体の一回限り使用）
--    生のシリアルは保存せず HMAC フィンガープリントのみ。衝突=使い回し。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS part_serial_registry (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_fingerprint      text NOT NULL UNIQUE,  -- HMAC(gtin|serial_no, platform_pepper)
  consumed_by_tenant_id   uuid REFERENCES tenants(id) ON DELETE SET NULL,
  installation_id         uuid REFERENCES part_installations(id) ON DELETE SET NULL,
  consumed_at             timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) part_integrity_findings（AI/ルールによる自動検知結果。L7 の受け皿）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS part_integrity_findings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id         uuid REFERENCES part_installations(id) ON DELETE CASCADE,
  rule                    text NOT NULL
                            CHECK (rule IN ('serial_reused','photo_duplicate','qty_mismatch',
                                            'three_way_mismatch','context_mismatch','deepfake',
                                            'photo_edited','timestamp_anomaly')),
  severity                text NOT NULL DEFAULT 'warning'
                            CHECK (severity IN ('info','warning','critical')),
  detail                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                  text NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_findings_installation
  ON part_integrity_findings(installation_id);
CREATE INDEX IF NOT EXISTS idx_part_findings_tenant_open
  ON part_integrity_findings(tenant_id, status) WHERE status = 'open';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) part_installation_evidence（証拠・追記専用）
--    写真は certificate_images の真正性カラム群を踏襲（C2PA/アテステーション/sha256/知覚ハッシュ）。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS part_installation_evidence (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id             uuid NOT NULL REFERENCES part_installations(id) ON DELETE CASCADE,
  kind                        text NOT NULL
                                CHECK (kind IN ('install_photo','context_photo','old_part_photo',
                                                'delivery_note','removed_part','seal','marking')),

  storage_path                text,
  sha256                      text,
  perceptual_hash             text,
  c2pa_verified               boolean NOT NULL DEFAULT false,
  device_attestation_verified boolean NOT NULL DEFAULT false,
  authenticity_grade          text NOT NULL DEFAULT 'unverified'
                                CHECK (authenticity_grade IN ('unverified','basic','verified','premium')),
  exif_captured_at            timestamptz,
  capture_nonce               text,        -- リプレイ封じ（ワンタイム値の写し込み）
  ocr_extracted               jsonb,       -- 納品書OCR結果（三方照合用・AI抽出）
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_evidence_installation
  ON part_installation_evidence(installation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_part_evidence_sha256
  ON part_installation_evidence(sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_evidence_phash
  ON part_installation_evidence(perceptual_hash) WHERE perceptual_hash IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) 既存テーブル拡張（すべて追加のみ・nullable）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS gtin                 text,
  ADD COLUMN IF NOT EXISTS default_serial_tracked boolean NOT NULL DEFAULT false;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS installation_id uuid REFERENCES part_installations(id) ON DELETE SET NULL;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS phone_full_hash      text,  -- sha256(v1|tenant_id|E164|PEPPER) 確定照合の主キー
  ADD COLUMN IF NOT EXISTS contact_provenance   text,  -- 'customer' | 'store'（CHECKは値投入後に別途）
  ADD COLUMN IF NOT EXISTS contact_verified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS contact_verified_via text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) updated_at 自動更新
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION part_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_part_installations_updated_at ON part_installations;
CREATE TRIGGER trg_part_installations_updated_at
  BEFORE UPDATE ON part_installations
  FOR EACH ROW EXECUTE FUNCTION part_set_updated_at();

DROP TRIGGER IF EXISTS trg_part_conf_sig_updated_at ON part_confirmation_signatures;
CREATE TRIGGER trg_part_conf_sig_updated_at
  BEFORE UPDATE ON part_confirmation_signatures
  FOR EACH ROW EXECUTE FUNCTION part_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) RLS（既存規約 my_tenant_ids() を踏襲）
--    追記専用テーブルは UPDATE/DELETE ポリシーを置かない（＋トリガで二重に保護）。
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE part_installations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_confirmation_signatures  ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_serial_registry          ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_integrity_findings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_installation_evidence    ENABLE ROW LEVEL SECURITY;

-- part_installations: テナントメンバーは参照・作成・更新可（不変性はトリガが強制）
CREATE POLICY part_installations_select ON part_installations
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY part_installations_insert ON part_installations
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY part_installations_update ON part_installations
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

-- part_confirmation_signatures: 参照のみ（作成/更新は署名フロー＝service-role）
CREATE POLICY part_conf_sig_select ON part_confirmation_signatures
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

-- part_serial_registry: 自テナントが消費した行のみ参照（衝突照合は SECURITY DEFINER 関数経由）
CREATE POLICY part_serial_registry_select ON part_serial_registry
  FOR SELECT USING (consumed_by_tenant_id IN (SELECT my_tenant_ids()));

-- part_integrity_findings: テナントは参照・作成可（AI/サーバが作成）
CREATE POLICY part_findings_select ON part_integrity_findings
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY part_findings_insert ON part_integrity_findings
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

-- part_installation_evidence: 参照・作成のみ（追記専用＝UPDATE/DELETE ポリシーなし）
CREATE POLICY part_evidence_select ON part_installation_evidence
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY part_evidence_insert ON part_installation_evidence
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

COMMENT ON TABLE part_installations IS
  '部品装着イベント。customer_verified で完全凍結（取消のみ可）。設計 docs/parts-installation-integrity-design.md';
