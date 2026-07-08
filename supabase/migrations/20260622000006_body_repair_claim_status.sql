-- =============================================================
-- 鈑金案件 保険査定ステータス (claim status)
--   保険会社から受領した「提出/承認/一部承認/差戻」と承認額・査定日を案件に
--   構造化して記録する (ギャップ監査 docs/body-repair-clerical-gap-audit-2026-06.md
--   断絶A: 支払可否指示の受領記録・承認額の確定)。
--   保険会社側 UI は増やさず、施工店が受領結果を記録・可視化する。
--   いずれも nullable 追加のみ (zero-downtime)。値域はアプリ層 (zod) で enum 強制。
--     claim_status: null=未提出 / 'submitted'=提出済(承認待ち) / 'approved'=承認 /
--                   'partial'=一部承認 / 'rejected'=差戻
-- =============================================================

alter table body_repair_jobs
  add column if not exists claim_status text,
  add column if not exists claim_approved_amount numeric(12, 0),
  add column if not exists claim_decided_at timestamptz;

comment on column body_repair_jobs.claim_status is
  '保険査定ステータス。null=未提出 / submitted=提出済 / approved=承認 / partial=一部承認 / rejected=差戻。値域は zod で強制。';
comment on column body_repair_jobs.claim_approved_amount is '保険会社の承認額 (円)。null=未確定。';
comment on column body_repair_jobs.claim_decided_at is '保険会社の査定結果を受領した日時。';
