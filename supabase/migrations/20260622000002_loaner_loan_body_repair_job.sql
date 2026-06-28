-- =============================================================
-- 代車貸出 ↔ 鈑金案件 の紐付け
--   loaner_car_loans に body_repair_job_id (任意) を追加し、鈑金案件側から
--   代車の貸出/返却・返却予定を扱えるようにする
--   (ギャップ監査 docs/body-repair-clerical-gap-audit-2026-06.md 断絶B / 代車)。
--   FK はマスタ (loaner_cars) ではなく貸出記録に持たせ、1 案件に複数の貸出履歴を
--   保持できるようにする (Codex レビュー反映)。案件削除時は履歴を残すため
--   ON DELETE SET NULL。
--
--   索引は既存テーブルへの追加のため、書込ロックを避けるべく companion migration
--   20260622000003 で CREATE INDEX CONCURRENTLY する。
-- =============================================================

alter table loaner_car_loans
  add column if not exists body_repair_job_id uuid references body_repair_jobs(id) on delete set null;

comment on column loaner_car_loans.body_repair_job_id is
  '紐付く鈑金案件 (任意)。案件側から代車の貸出/返却・返却予定を照合するために使う。';
