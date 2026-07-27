-- =============================================================
-- square_sync_runs: コードが利用している値・カラムに CHECK 制約 / スキーマを揃える
--
-- 既存スキーマ (20260323110001_square_integration.sql):
--   status       CHECK IN ('running', 'completed', 'failed', 'partial')
--   trigger_type CHECK IN ('manual', 'scheduled', 'webhook')
--   error_message 列なし
--
-- 実コードが利用している値:
--   /api/admin/square/sync      → INSERT status: "queued"
--   /api/qstash/square-sync     → UPDATE status: "processing" / error_message: "..."
--   /api/cron/square-sync       → INSERT trigger_type: "auto"
--
-- これらが CHECK 違反 / undefined column で 500 を返し、店舗設定画面の
-- 「手動同期」ボタンがサーバーエラーになっていた。コードが既に運用フローを
-- 表す状態として "queued" / "processing" を使っているので、コード側を
-- 変えるのではなく DB 側を許容範囲に揃える。
-- =============================================================

-- 1) status enum を queued / processing 込みに広げる
ALTER TABLE square_sync_runs DROP CONSTRAINT IF EXISTS square_sync_runs_status_check;
ALTER TABLE square_sync_runs ADD CONSTRAINT square_sync_runs_status_check
  CHECK (status IN ('queued', 'processing', 'running', 'completed', 'failed', 'partial'));

-- 2) trigger_type enum に cron が使う 'auto' を追加
ALTER TABLE square_sync_runs DROP CONSTRAINT IF EXISTS square_sync_runs_trigger_type_check;
ALTER TABLE square_sync_runs ADD CONSTRAINT square_sync_runs_trigger_type_check
  CHECK (trigger_type IN ('manual', 'scheduled', 'webhook', 'auto'));

-- 3) qstash worker が書き込む error_message 列を追加 (任意 / 単一行メッセージ)
ALTER TABLE square_sync_runs
  ADD COLUMN IF NOT EXISTS error_message text;

COMMENT ON COLUMN square_sync_runs.error_message IS
  'QStash worker が失敗時に書き込む短いエラーメッセージ。詳細は errors_json (jsonb) を使う。';
