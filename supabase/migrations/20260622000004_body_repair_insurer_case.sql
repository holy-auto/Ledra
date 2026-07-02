-- =============================================================
-- 鈑金案件 ↔ 保険案件 (insurer_cases) のリンク
--   body_repair_jobs に insurer_case_id (任意) を追加し、施工店が案件から
--   保険会社とのやり取り (メッセージ往復) を辿れるようにする
--   (ギャップ監査 docs/body-repair-clerical-gap-audit-2026-06.md 断絶A)。
--   会話/添付スキーマ (insurer_case_messages / insurer_case_attachments) は
--   既存・テナント双方向 RLS 済みなので、ここではリンクのみ追加する。
--   案件クローズ等で保険案件が消えても鈑金案件は残すため ON DELETE SET NULL。
--
--   索引は既存テーブルへの追加のため、companion migration 20260622000005 で
--   CREATE INDEX CONCURRENTLY する。
-- =============================================================

alter table body_repair_jobs
  add column if not exists insurer_case_id uuid references insurer_cases(id) on delete set null;

comment on column body_repair_jobs.insurer_case_id is
  '紐付く保険案件 (任意)。施工店が案件から保険会社とのメッセージ往復を辿るために使う。';
