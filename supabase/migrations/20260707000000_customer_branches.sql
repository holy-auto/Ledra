-- =============================================================
-- 法人顧客の支店 (branch) マスタ
--
-- BtoB (法人) 顧客は本社のほかに複数の支店・営業所を持つことがある。
-- 請求書・書類の宛先や担当窓口を支店単位で管理できるよう、顧客に
-- ぶら下がる 1:N の支店マスタを追加する。個人 (BtoC) 顧客では使わない。
--
--   customer_id     : 親となる法人顧客 (customers.id)。顧客削除で支店も削除。
--   name            : 支店名 (例: 東京支店)。必須。
--   name_kana       : 支店名フリガナ。任意。
--   postal_code     : 郵便番号。任意。
--   address         : 住所。任意。
--   phone           : 電話番号。任意。
--   contact_person  : 支店の担当者名。任意。
--   contact_email   : 支店の担当者メール。任意。
--   note            : 備考。任意。
-- =============================================================

CREATE TABLE IF NOT EXISTS customer_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_kana text,
  postal_code text,
  address text,
  phone text,
  contact_person text,
  contact_email text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_customer_branches_customer
  ON customer_branches (tenant_id, customer_id, created_at DESC);

-- RLS: 自テナントの支店のみ参照・変更可能。
ALTER TABLE customer_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_branches_tenant_select ON customer_branches;
CREATE POLICY customer_branches_tenant_select ON customer_branches
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- INSERT/UPDATE では tenant メンバーであることに加え、親顧客 (customer_id) が
-- 同じ tenant に属することも要求する。customer_id は customers(id) のみを参照する
-- ため、これがないと他テナントの顧客UUIDを知るメンバーが自テナント配下に
-- 越境した支店行を差し込めてしまう (Supabase クライアント直叩き経路)。
DROP POLICY IF EXISTS customer_branches_tenant_insert ON customer_branches;
CREATE POLICY customer_branches_tenant_insert ON customer_branches
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_branches.customer_id
        AND c.tenant_id = customer_branches.tenant_id
    )
  );

DROP POLICY IF EXISTS customer_branches_tenant_update ON customer_branches;
CREATE POLICY customer_branches_tenant_update ON customer_branches
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_branches.customer_id
        AND c.tenant_id = customer_branches.tenant_id
    )
  );

DROP POLICY IF EXISTS customer_branches_tenant_delete ON customer_branches;
CREATE POLICY customer_branches_tenant_delete ON customer_branches
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

COMMENT ON TABLE customer_branches IS
  '法人顧客の支店・営業所マスタ (顧客に対し 1:N)。請求書・書類の宛先や担当窓口を支店単位で管理する。';
COMMENT ON COLUMN customer_branches.customer_id IS
  '親となる法人顧客 (customers.id)。顧客削除時に CASCADE で支店も削除。';
COMMENT ON COLUMN customer_branches.name IS
  '支店名 (例: 東京支店)。必須。';
COMMENT ON COLUMN customer_branches.contact_person IS
  '支店の担当者名。任意。';
