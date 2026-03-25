-- =============================================================
-- Google Calendar pull 同期: source に 'gcal' を追加 + sync_log action 拡張
-- =============================================================

-- reservations.source カラムを追加（存在しない場合）
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- reservations.source に 'gcal' を追加
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_source_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_source_check
  CHECK (source IN ('manual', 'google_maps', 'gcal', 'line', 'web'));

-- gcal_sync_log.action に pull_create / pull_update を追加
ALTER TABLE gcal_sync_log DROP CONSTRAINT IF EXISTS gcal_sync_log_action_check;
ALTER TABLE gcal_sync_log ADD CONSTRAINT gcal_sync_log_action_check
  CHECK (action IN ('create', 'update', 'delete', 'pull', 'pull_create', 'pull_update'));
