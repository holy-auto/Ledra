-- 在庫アイテムに商品バーコード列を追加。
--
-- 背景: storefront モードの在庫入出庫はカメラでバーコードを読み取って品目を
-- 即座に特定したい。sku は「自社管理コード」なのに対し、barcode は商品本体に
-- 印字された JAN/EAN-13/UPC/Code128 等の生文字列で、別概念として保持する。
-- カメラスキャン (@zxing) のデコード結果でこの列を完全一致ルックアップする。
--
-- additive / 冪等。NOT NULL を付けない (任意項目) ので zero-downtime。
-- 一意インデックスは CONCURRENTLY のため別ファイルに分離:
--   20260601000005_inventory_barcode_index.sql

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS barcode text;

COMMENT ON COLUMN inventory_items.barcode IS
  '商品バーコードの生文字列 (JAN/EAN-13/UPC/Code128 等)。カメラスキャンの完全一致キー。sku とは別概念。';
