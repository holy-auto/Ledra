-- 標準工数 × レバーレートによる工賃自動算出の土台
--
-- 背景 (docs/pdca-ideals-gap-2026-07.md):
--   整備見積で日整連 (JASPA) 等の標準工数を反映し工賃計算を自動化する。
--   工数データ自体は有償ライセンスのためテナントが CSV で取り込み、
--   Ledra は「工数 (h) × レバーレート (円/h) = 工賃」の算出と一括再計算を担う。
--
-- 設計: unit_price を単一の真実として維持する。工数・レートから算出した工賃は
--   menu_items.unit_price に保存されるため、見積 (documents) / クイック見積 /
--   AI 見積など下流は一切変更不要で工賃が反映される。
--   レバーレート変更時は設定保存アクションが labor_hours 持ち品目を一括再計算する。

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS labor_rate_per_hour integer;

COMMENT ON COLUMN tenants.labor_rate_per_hour IS
  'レバーレート (工賃単価、円/時)。NULL=未設定 (工数からの工賃自動算出は無効)。';

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS labor_hours numeric(6, 2);

COMMENT ON COLUMN menu_items.labor_hours IS
  '標準工数 (時間)。日整連指数等を CSV 取込で保持する。NULL=工数管理外。'
  '設定時は 提供価格 unit_price = round(labor_hours × tenants.labor_rate_per_hour) を自動算出。';
