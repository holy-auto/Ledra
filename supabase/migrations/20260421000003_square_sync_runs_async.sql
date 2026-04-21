-- square_sync_runs テーブルに非同期カーソルページネーション用カラムを追加
ALTER TABLE square_sync_runs
  ADD COLUMN IF NOT EXISTS cursor TEXT,
  ADD COLUMN IF NOT EXISTS processed_count INTEGER DEFAULT 0;
