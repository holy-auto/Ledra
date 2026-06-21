-- =============================================================
-- 車体整備 進捗トラッキングトークンの一意索引 (CONCURRENTLY)
--
-- Companion to 20260621000000 (track_token カラム追加)。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため別ファイル。
-- token は公開ルックアップのキーなので一意かつ高速参照が必要。
-- =============================================================

create unique index concurrently if not exists uq_brj_track_token
  on body_repair_jobs (track_token) where track_token is not null;
