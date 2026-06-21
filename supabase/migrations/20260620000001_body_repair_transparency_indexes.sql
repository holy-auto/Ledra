-- =============================================================
-- 車体整備 透明性ガイドライン準拠 — 既存テーブルへの索引 (CONCURRENTLY)
--
-- Companion to 20260620000000 (カラム追加)。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため、
-- 既存テーブル (certificate_images / body_repair_jobs — 通常運用で書き込まれる)
-- への索引追加はこのファイルに分離し、書込ロックを避ける。
-- =============================================================

-- (1) 画像の段階別事後検証クエリ用 (例: 案件の作業実施中写真だけ取得)
create index concurrently if not exists idx_certimg_stage
  on certificate_images (certificate_id, stage);

-- (4) FK covering index (lookup / on delete set null 用)
create index concurrently if not exists idx_brj_certificate
  on body_repair_jobs (certificate_id) where certificate_id is not null;
create index concurrently if not exists idx_brj_estimate_doc
  on body_repair_jobs (estimate_document_id) where estimate_document_id is not null;
create index concurrently if not exists idx_brj_invoice_doc
  on body_repair_jobs (invoice_document_id) where invoice_document_id is not null;

-- 保存期限による抽出 (retention cron / 事後検証) 用
create index concurrently if not exists idx_brj_retention
  on body_repair_jobs (tenant_id, record_retention_until) where record_retention_until is not null;
