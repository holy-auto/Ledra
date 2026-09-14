-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- **CONCURRENTLY を外した。** Supabase のブランチ機能はマイグレーションの複数文を
-- パイプラインで送るため、2文目以降の CONCURRENTLY が
-- `CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)`
-- で落ちる。CONCURRENTLY が要るのは「書き込みが走っている本番のテーブルをロックしない」
-- ためで、このファイルは本番では再適用されず、空 DB では対象テーブルが空なので
-- ロックの問題は起きない。
-- 新しいファイルで CONCURRENTLY を使うときは **1ファイル1文** にすること
-- （`npm run lint:migrations` の concurrently-in-multi-statement-file が見ている）。
-- =============================================================
-- 車体整備 透明性ガイドライン準拠 — 既存テーブルへの索引
--
-- Companion to 20260620000000 (カラム追加)。
-- 元は CREATE INDEX CONCURRENTLY のため（このファイルは 2026-09-04 に CONCURRENTLY を外した。冒頭の注を参照）、
-- 既存テーブル (certificate_images / body_repair_jobs — 通常運用で書き込まれる)
-- への索引追加はこのファイルに分離し、書込ロックを避ける。
-- =============================================================

-- (1) 画像の段階別事後検証クエリ用 (例: 案件の作業実施中写真だけ取得)
create index if not exists idx_certimg_stage
  on certificate_images (certificate_id, stage);

-- (4) FK covering index (lookup / on delete set null 用)
create index if not exists idx_brj_certificate
  on body_repair_jobs (certificate_id) where certificate_id is not null;
create index if not exists idx_brj_estimate_doc
  on body_repair_jobs (estimate_document_id) where estimate_document_id is not null;
create index if not exists idx_brj_invoice_doc
  on body_repair_jobs (invoice_document_id) where invoice_document_id is not null;

-- 保存期限による抽出 (retention cron / 事後検証) 用
create index if not exists idx_brj_retention
  on body_repair_jobs (tenant_id, record_retention_until) where record_retention_until is not null;
