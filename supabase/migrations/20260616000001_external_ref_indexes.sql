-- =============================================================================
-- 基幹ソフト連携 — external_ref の複合ユニーク索引 (CONCURRENTLY)
--
-- Companion to 20260616000000 (source_system / external_ref カラム追加)。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため別ファイルに
-- 分離する。customers / vehicles / vehicle_histories は通常運用で頻繁に書き込ま
-- れるテーブルなので、索引作成中の書き込みロックを避ける狙いもある。
--
-- 冪等 upsert のキー: (tenant_id, source_system, external_ref)。
-- Postgres は UNIQUE 内の NULL を distinct 扱いするため、手動作成レコード
-- (external_ref / source_system が NULL) は重複制約に掛からず、取込レコード
-- (両方 NOT NULL) のみが一意化される。
-- =============================================================================

create unique index concurrently if not exists uq_customers_external
  on customers (tenant_id, source_system, external_ref);

create unique index concurrently if not exists uq_vehicles_external
  on vehicles (tenant_id, source_system, external_ref);

create unique index concurrently if not exists uq_vehicle_histories_external
  on vehicle_histories (tenant_id, source_system, external_ref);
