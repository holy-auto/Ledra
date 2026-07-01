-- =============================================================
-- 中古車商談 ↔ 見積書 の結線
--
-- market_deals に estimate_document_id (documents への FK) を追加し、商談から
-- 生成した「諸費用・支払総額の見積」ドキュメントを紐付けられるようにする。
-- 鈑金案件 (body_repair_jobs.estimate_document_id, 20260620000000) と同じ設計。
--
-- ADD COLUMN は nullable / DEFAULT なしのためテーブル書き換えを伴わず zero-downtime。
-- 支援索引 (CONCURRENTLY) は companion migration 20260701000002 に分離する。
-- =============================================================

alter table market_deals
  add column if not exists estimate_document_id uuid
    references documents (id) on delete set null;
