-- =============================================================
-- 案件サインオフ・ワークフロー — インデックス
--
-- 20260703000000_job_signoff_workflow.sql で追加した列に対する
-- インデックスを CONCURRENTLY で作成する。CONCURRENTLY は transaction 内で
-- 実行できないため、列追加とは別マイグレーションに分離している
-- (Supabase migration ランナーは個別ステートメントを auto-commit する)。
-- すべて IF NOT EXISTS で再実行安全。
-- =============================================================

-- 受領サイン ↔ 予約 の逆引き (案件からサイン状況を引く)。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_signature_sessions_reservation
  ON signature_sessions (reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_receipts_reservation
  ON delivery_receipts (reservation_id)
  WHERE reservation_id IS NOT NULL;

-- 署名待ち (awaiting) の案件を期限順に素早く一覧する (overdue 監視用)。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reservations_signoff_awaiting
  ON reservations (tenant_id, signoff_deadline)
  WHERE signoff_status = 'awaiting';
