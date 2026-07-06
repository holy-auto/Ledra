-- 品目マスタに大／中／小カテゴリ（3階層）を追加する
--
-- 分類軸そのものを別マスタで持たず、品目テーブル上の自由入力3列とする。
-- UI 側で既存値を datalist サジェストするため「既存から選ぶ / 新規に打つ」の
-- 両方が可能（＝表記ゆれ防止はサジェストで緩やかに担保）。
-- いずれも NULL 可（既存品目・未分類品目は空のまま）。

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS category_large  text,
  ADD COLUMN IF NOT EXISTS category_medium text,
  ADD COLUMN IF NOT EXISTS category_small  text;

COMMENT ON COLUMN public.menu_items.category_large  IS '大カテゴリ（自由入力・任意）。一覧の絞り込み／カテゴリ単位の一括操作に使用。';
COMMENT ON COLUMN public.menu_items.category_medium IS '中カテゴリ（自由入力・任意）。大カテゴリの下位区分。';
COMMENT ON COLUMN public.menu_items.category_small  IS '小カテゴリ（自由入力・任意）。中カテゴリの下位区分。';

-- ponytail: カテゴリ絞り込みは GET で取得済みのテナント品目を UI 側でフィルタするため
-- 専用インデックスは張らない。品目数が数千件規模まで増え、サーバ側でカテゴリ絞り込み
-- クエリを追加する段になったら (tenant_id, category_large, ...) の複合インデックスを
-- CONCURRENTLY で別マイグレーションとして追加する。
