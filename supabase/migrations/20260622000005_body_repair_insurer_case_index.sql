-- =============================================================
-- 鈑金案件 ↔ 保険案件 の索引 (CONCURRENTLY)
--
-- Companion to 20260622000004 (insurer_case_id カラム追加)。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため別ファイル。
-- 保険案件から紐付く鈑金案件を引くルックアップのため部分索引を張る。
-- =============================================================

create index concurrently if not exists idx_brj_insurer_case
  on body_repair_jobs (insurer_case_id) where insurer_case_id is not null;
