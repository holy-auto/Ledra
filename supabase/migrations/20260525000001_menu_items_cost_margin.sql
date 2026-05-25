-- 品目マスタに原価・利益率を追加し、提供価格（unit_price）の自動算出を可能にする
--
-- 計算式（マークアップ率方式）:
--   unit_price = round(cost_price × (1 + margin_rate / 100))
--
-- margin_rate は NULL 可（未設定なら unit_price を手動入力扱い）
-- cost_price は DEFAULT 0（既存品目は原価未登録として扱える）

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS cost_price  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_rate numeric(6, 2);

COMMENT ON COLUMN public.menu_items.cost_price IS
  '原価（仕入値）。利益率と組み合わせて提供価格を自動算出する基準値。';
COMMENT ON COLUMN public.menu_items.margin_rate IS
  '利益率（％、マークアップ率）。提供価格 = 原価 × (1 + margin_rate/100)。NULL 時は unit_price を手動入力扱い。';
