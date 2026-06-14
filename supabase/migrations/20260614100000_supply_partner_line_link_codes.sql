-- 供給パートナー (メーカー) の LINE 連携コード — 友だち追加→紐付け導線 (Phase 4)。
--
-- メーカーが受注ポータルで短いコードを発行し、Ledra 公式 LINE 公式アカウントに
-- そのコードを送ると、プラットフォーム webhook が照合して supply_partners.line_user_id
-- をセットする。LIFF/OAuth 不要の低摩擦方式 (src/lib/line/linkCode.ts と同方式)。
--
-- 生コードは保存せず sha256(pepper) のみ・短期限・単回使用。コード発行は owner 本人、
-- 消費 (照合 + 紐付け) は webhook の service-role が行う。
CREATE TABLE IF NOT EXISTS supply_partner_line_link_codes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_partner_id  uuid NOT NULL REFERENCES supply_partners(id) ON DELETE CASCADE,
  code_hash          text NOT NULL,
  expires_at         timestamptz NOT NULL,
  used_at            timestamptz,
  used_line_user_id  text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spllc_partner ON supply_partner_line_link_codes(supply_partner_id);
CREATE INDEX IF NOT EXISTS idx_spllc_code_hash ON supply_partner_line_link_codes(code_hash) WHERE used_at IS NULL;

ALTER TABLE supply_partner_line_link_codes ENABLE ROW LEVEL SECURITY;

-- owner (パートナー本人) のみ自分のコードを発行・閲覧できる。消費は service-role (RLS バイパス)。
DROP POLICY IF EXISTS "spllc_select_owner" ON supply_partner_line_link_codes;
CREATE POLICY "spllc_select_owner" ON supply_partner_line_link_codes
  FOR SELECT USING (supply_partner_id IN (SELECT my_supply_partner_ids()));
DROP POLICY IF EXISTS "spllc_insert_owner" ON supply_partner_line_link_codes;
CREATE POLICY "spllc_insert_owner" ON supply_partner_line_link_codes
  FOR INSERT WITH CHECK (supply_partner_id IN (SELECT my_supply_partner_ids()));

COMMENT ON TABLE supply_partner_line_link_codes IS
  '供給パートナーの LINE 連携コード。code_hash のみ保存・短期限・単回使用。消費は webhook(service-role)。';
