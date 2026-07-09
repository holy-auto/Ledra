-- 品目マスタ(menu_items)に品番(item_code)を追加。
-- 帳票作成時に品番で検索して入力できるようにするため。
-- 一意索引は CONCURRENTLY が必要でトランザクション内では実行できないため、
-- 20260709000003_menu_items_item_code_index.sql に分離する。

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS item_code text;
