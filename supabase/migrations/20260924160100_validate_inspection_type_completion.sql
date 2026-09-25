-- =============================================================
-- inspection_records.inspection_type CHECK の VALIDATE  [G5 / Phase 1a]
--
-- 20260924160000 で 'completion'(完成検査) を追加する CHECK を NOT VALID で作成した。
-- 値の追加のみで既存行は必ず満たすため、ここで検証を確定する（弱いロックで済む）。
-- =============================================================
alter table inspection_records
  validate constraint inspection_records_inspection_type_check;
