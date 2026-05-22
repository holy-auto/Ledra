-- =============================================================
-- Reservation work timer — partial index on tenant_id + work_started_at
-- 20260520000000_reservation_work_timer.sql で追加した
-- work_started_at の検索を高速化するための部分インデックス。
--
-- スタッフ稼働ダッシュボード / 案件タイマー一覧で
--   .eq("tenant_id", t).not("work_started_at", "is", null)
--     .order("work_started_at", { ascending: false })
-- のクエリパターンを seq scan させない目的。
--
-- CONCURRENTLY なので transaction で囲わない
-- (Supabase migration ランナーは個別ステートメントを auto-commit する)。
-- IF NOT EXISTS で再実行安全。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reservations_work_started_at
  ON reservations (tenant_id, work_started_at DESC)
  WHERE work_started_at IS NOT NULL;
