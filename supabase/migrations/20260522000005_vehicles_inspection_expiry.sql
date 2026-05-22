-- =============================================================
-- vehicles: 車検満了日 (inspection_expiry_date) + リマインダー送信記録
--
-- 車検証 OCR (src/lib/ocr/shakensho.ts) が `expiry_date` を抽出して
-- いるが、これまでは API レスポンスだけで永続化されていなかった。
-- 本マイグレーションで永続化先を用意し、follow-up cron から
-- 「車検X日前」のリマインダーを送れるようにする。
--
-- 既存の `follow_up_settings.inspection_pre_days` (default 60) は
-- 既にあるが未使用だったので、今回これと噛み合うようになる。
--
-- See: docs/inspection-reminders-design.md (PR 内で追加)
-- =============================================================

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS inspection_expiry_date      date,
  ADD COLUMN IF NOT EXISTS inspection_reminder_sent_at timestamptz;

COMMENT ON COLUMN vehicles.inspection_expiry_date IS
  '車検満了日 (有効期間ノ満了スル日)。車検証 OCR の expiry_date を保存。';
COMMENT ON COLUMN vehicles.inspection_reminder_sent_at IS
  '最終リマインダー送信時刻。同じ車検期に二重送信しないためのガード。';
