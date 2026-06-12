-- =============================================================
-- 車検満了日管理 (Vehicle Inspection / Shaken Expiry Tracking)
--
-- 車検満了日は既存の vehicles.inspection_expiry_date (車検証 OCR の
-- expiry_date を保存) を正とする。本機能では新カラムを追加せず、
-- 既存カラムを再利用する (二重管理を避けるため)。
--   - 既存カラム: inspection_expiry_date (date), inspection_reminder_sent_at (timestamptz)
--     -> supabase/migrations/20260522000005_vehicles_inspection_expiry.sql
--   - 既存 index: idx_vehicles_inspection_expiry ON (inspection_expiry_date)
--     -> supabase/migrations/20260522000006_vehicles_inspection_expiry_index.sql
--
-- ダッシュボード (/admin/vehicles/shaken) はテナント別に
-- 「(tenant_id) かつ (inspection_expiry_date が今日±N日の範囲)」を
-- スキャンするため、tenant_id を先頭に持つ複合 partial index を追加する。
-- 既存の単一列 index ではテナント絞り込みが効かず全テナント分を
-- 走査してしまうため。
--
-- vehicles は既存テーブルなので CREATE INDEX は CONCURRENTLY 必須
-- (このファイルは index 追加のみ。トランザクション内で CONCURRENTLY は
--  実行できないため、ALTER 等は含めない)。
-- =============================================================

create index concurrently if not exists idx_vehicles_tenant_shaken
  on vehicles (tenant_id, inspection_expiry_date)
  where inspection_expiry_date is not null;
