-- 品番(item_code)はテナント内で一意（任意項目なので NULL は除外）。検索にもこの索引を使う。
-- CONCURRENTLY はトランザクション内で実行できないため、単独のファイルに分離している。

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_menu_items_tenant_item_code
  ON menu_items(tenant_id, item_code) WHERE item_code IS NOT NULL;
