-- ================================================================
-- RLS ハードニング (2): 共有マスタ読み取りを authenticated 限定へ
--
-- shop_products / standard_rules はテナント横断の共有マスタ
-- (tenant_id を持たない) なので USING(true) 自体は設計どおり。
-- ただし TO 句が無く anon (未認証) にも開いていたため、ドキュメント
-- 上の意図 (「認証済みユーザーなら閲覧可」) に合わせて authenticated
-- 限定へ絞り、公開 anon キー経由のカタログ/ルート閲覧を排除する。
-- 書き込みは従来どおり service-role (RLS バイパス) 経由のみ。
-- ================================================================

-- ── shop_products: 運営管理の販売カタログ ──────────────────────
DROP POLICY IF EXISTS "shop_products_select" ON shop_products;

CREATE POLICY "shop_products_select" ON shop_products
  FOR SELECT
  TO authenticated
  USING (true);

-- ── standard_rules: AI 品質アカデミーの共有ルール ──────────────
DROP POLICY IF EXISTS "standard_rules_read_all" ON standard_rules;

CREATE POLICY "standard_rules_read_all" ON standard_rules
  FOR SELECT
  TO authenticated
  USING (true);
