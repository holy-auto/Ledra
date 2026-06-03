-- =============================================================================
-- 部品装着インテグリティ — Phase 13: 顧客LINE連携コード（友だち追加→linkage 導線）
--
-- 設計: docs/parts-installation-integrity-design.md §6.4.2
--
-- 店が顧客ごとに短い連携コードを発行 → 顧客が LINE 公式アカウントにそのコードを送信
-- → 既存 webhook が照合し customers.line_user_id をセットする（低摩擦・LIFF不要）。
-- 生コードは保存せず sha256 ハッシュのみ。短期限・単回使用。
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_line_link_codes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  code_hash         text NOT NULL,
  expires_at        timestamptz NOT NULL,
  used_at           timestamptz,
  used_line_user_id text,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 未使用コードの照合用（webhook が tenant 内で code_hash を引く）
CREATE INDEX IF NOT EXISTS idx_line_link_codes_lookup
  ON customer_line_link_codes(tenant_id, code_hash)
  WHERE used_at IS NULL;

ALTER TABLE customer_line_link_codes ENABLE ROW LEVEL SECURITY;

-- 参照は自テナントのみ（発行/消費は service-role / tenant-scoped admin 経由）。
CREATE POLICY line_link_codes_select ON customer_line_link_codes
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
