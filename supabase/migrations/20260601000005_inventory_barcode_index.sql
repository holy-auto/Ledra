-- =============================================================
-- inventory_items — バーコードの一意インデックス (CONCURRENTLY)
--
-- Companion to 20260601000004 (barcode カラム追加)。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため別ファイルに
-- 分離する。inventory_items は storefront 在庫 UI が頻繁に読むテーブルなので、
-- インデックス作成中の書き込みロックを避ける狙いもある。
--
-- テナント内で barcode を一意にする (任意項目なので NULL は除外)。
-- カメラスキャンの完全一致ルックアップ (barcode= クエリ) はこのインデックスを使う。
-- =============================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_inventory_items_tenant_barcode
  ON inventory_items (tenant_id, barcode)
  WHERE barcode IS NOT NULL;
