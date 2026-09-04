-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- **CONCURRENTLY を外した。** Supabase のブランチ機能はマイグレーションの複数文を
-- パイプラインで送るため、2文目以降の CONCURRENTLY が
-- `CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)`
-- で落ちる。CONCURRENTLY が要るのは「書き込みが走っている本番のテーブルをロックしない」
-- ためで、このファイルは本番では再適用されず、空 DB では対象テーブルが空なので
-- ロックの問題は起きない。
-- 新しいファイルで CONCURRENTLY を使うときは **1ファイル1文** にすること
-- （`npm run lint:migrations` の concurrently-in-multi-statement-file が見ている）。
-- =============================================================
-- 案件サインオフ・ワークフロー — インデックス
--
-- 20260703000000_job_signoff_workflow.sql で追加した列に対する
-- インデックスを作成する。元は CONCURRENTLY のため列追加とは別マイグレーションに
-- 分離していた（2026-09-04 に CONCURRENTLY を外した。冒頭の注を参照）。
-- すべて IF NOT EXISTS で再実行安全。
-- =============================================================

-- 受領サイン ↔ 予約 の逆引き (案件からサイン状況を引く)。
CREATE INDEX IF NOT EXISTS idx_signature_sessions_reservation
  ON signature_sessions (reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_receipts_reservation
  ON delivery_receipts (reservation_id)
  WHERE reservation_id IS NOT NULL;

-- 署名待ち (awaiting) の案件を期限順に素早く一覧する (overdue 監視用)。
CREATE INDEX IF NOT EXISTS idx_reservations_signoff_awaiting
  ON reservations (tenant_id, signoff_deadline)
  WHERE signoff_status = 'awaiting';
