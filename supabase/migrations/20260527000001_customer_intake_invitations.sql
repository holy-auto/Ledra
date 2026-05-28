-- Customer intake invitations
--
-- 店舗が顧客に対して「URL/QR を発行 → 顧客が事前にカルテ(基本情報) を
-- 入力できる」ためのトークン. OCR (身分証で自動入力) も同じトークンで
-- 公開エンドポイントから叩けるようにし、公開 OCR の濫用を token で
-- 防御する.
--
-- セキュリティ:
-- - token は never persisted in raw form, only sha256 hash + pepper
-- - 有効期限あり (デフォルト 7 日, max 30 日)
-- - 1回送信したら status='completed' で OCR / submit 不可
-- - tenant_id 必須, RLS で他テナント参照不可
-- - 個人番号 (12 桁) は CHECK 制約で混入防止

CREATE TABLE IF NOT EXISTS customer_intake_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  -- sha256(token || pepper). raw token は never stored.
  token_hash text NOT NULL UNIQUE,
  -- 短縮 ID (URL の人間可読部分). token そのものではない. lookup を高速化.
  short_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'revoked', 'expired')),
  -- 表示用のラベル (例: "山田様 初診カルテ"). 任意.
  label text,
  -- 連絡先 (任意, ある場合は send-link で使う)
  contact_email text,
  contact_phone text,
  -- 期限切れ管理
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  revoked_at timestamptz,
  -- 完了時に作成された customers レコード
  completed_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  -- OCR 利用回数の追跡 (公開 OCR 濫用検知)
  ocr_attempts integer NOT NULL DEFAULT 0,
  CONSTRAINT intake_max_ocr CHECK (ocr_attempts <= 10),
  CONSTRAINT intake_expires_future CHECK (expires_at > created_at),
  CONSTRAINT intake_no_mynumber CHECK (
    label IS NULL OR label !~ '^\d{12}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_intake_tenant_status
  ON customer_intake_invitations (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_expires
  ON customer_intake_invitations (expires_at)
  WHERE status = 'pending';

-- RLS
ALTER TABLE customer_intake_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intake_tenant_select ON customer_intake_invitations;
CREATE POLICY intake_tenant_select ON customer_intake_invitations
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS intake_tenant_insert ON customer_intake_invitations;
CREATE POLICY intake_tenant_insert ON customer_intake_invitations
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS intake_tenant_update ON customer_intake_invitations;
CREATE POLICY intake_tenant_update ON customer_intake_invitations
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS intake_tenant_delete ON customer_intake_invitations;
CREATE POLICY intake_tenant_delete ON customer_intake_invitations
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

COMMENT ON TABLE customer_intake_invitations IS
  '事前カルテ入力用の招待トークン. 店舗→顧客に URL/QR を発行し、顧客自身が基本情報 + OCR で自動入力する.';
COMMENT ON COLUMN customer_intake_invitations.token_hash IS
  'sha256(token || pepper). raw token は never stored. 検証時に再計算して比較.';
COMMENT ON COLUMN customer_intake_invitations.short_id IS
  'URL パスに使う短縮ID (例: /intake/abc12345). token そのものではないので漏洩しても被害は限定的.';
COMMENT ON COLUMN customer_intake_invitations.ocr_attempts IS
  '公開 OCR の利用回数. 10 回超で CHECK 違反となり trip wire 発火.';

-- customers に birth_date を追加 (intake で取得した生年月日を保存するため).
-- Phase 2 JPKI 路線でも同カラムを再利用する想定.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS birth_date date;

COMMENT ON COLUMN customers.birth_date IS
  '生年月日. intake (OCR 自動入力) または JPKI 本人確認で取得.';

-- ocr_attempts をアトミックにインクリメントする RPC. CHECK 違反時は false で返す.
CREATE OR REPLACE FUNCTION increment_intake_ocr_attempts(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  UPDATE customer_intake_invitations
  SET ocr_attempts = ocr_attempts + 1
  WHERE id = p_id
    AND status = 'pending'
    AND ocr_attempts < 10
  RETURNING ocr_attempts INTO v_next;

  RETURN v_next IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION increment_intake_ocr_attempts(uuid) FROM public;
GRANT EXECUTE ON FUNCTION increment_intake_ocr_attempts(uuid) TO service_role;
