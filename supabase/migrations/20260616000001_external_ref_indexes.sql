-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- **CONCURRENTLY を外した。** Supabase のブランチ機能はマイグレーションの複数文を
-- パイプラインで送るため、2文目以降の CONCURRENTLY が
-- `CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)`
-- で落ちる。CONCURRENTLY が要るのは「書き込みが走っている本番のテーブルをロックしない」
-- ためで、このファイルは本番では再適用されず、空 DB では対象テーブルが空なので
-- ロックの問題は起きない。
-- 新しいファイルで CONCURRENTLY を使うときは **1ファイル1文** にすること
-- （`npm run lint:migrations` の concurrently-in-multi-statement-file が見ている）。
-- =============================================================================
-- 基幹ソフト連携 — external_ref の複合ユニーク索引
--
-- Companion to 20260616000000 (source_system / external_ref カラム追加)。
-- 元は CONCURRENTLY のため別ファイルに分離していた（このファイルは 2026-09-04 に CONCURRENTLY を外した。冒頭の注を参照）。
-- customers / vehicles / vehicle_histories は通常運用で頻繁に書き込まれる
-- テーブルだが、このファイルは本番では再適用されない。
--
-- 冪等 upsert のキー: (tenant_id, source_system, external_ref)。
-- Postgres は UNIQUE 内の NULL を distinct 扱いするため、手動作成レコード
-- (external_ref / source_system が NULL) は重複制約に掛からず、取込レコード
-- (両方 NOT NULL) のみが一意化される。
-- =============================================================================

create unique index if not exists uq_customers_external
  on customers (tenant_id, source_system, external_ref);

create unique index if not exists uq_vehicles_external
  on vehicles (tenant_id, source_system, external_ref);

create unique index if not exists uq_vehicle_histories_external
  on vehicle_histories (tenant_id, source_system, external_ref);
