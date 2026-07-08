-- =============================================================
-- 代車貸出 ↔ 鈑金案件 の索引 (CONCURRENTLY)
--
-- Companion to 20260622000002 (body_repair_job_id カラム追加)。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため別ファイル。
-- 案件から「この案件の代車貸出」を引くルックアップのため部分索引を張る。
-- =============================================================

create index concurrently if not exists idx_loaner_loans_body_repair_job
  on loaner_car_loans (body_repair_job_id) where body_repair_job_id is not null;
