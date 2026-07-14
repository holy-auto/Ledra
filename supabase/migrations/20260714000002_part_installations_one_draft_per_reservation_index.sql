-- =============================================================
-- part_installations — 予約あたり draft は同時に1件までの一意インデックス (CONCURRENTLY)
--
-- 予約の「部品交換あり」トグルは (存在確認 SELECT → INSERT) の check-then-act で下書きを
-- 作成するため、同時多重リクエスト (オフライン再送・二重タップ等) では冪等性が保証できない。
-- 別ファイルにしたのは CREATE INDEX CONCURRENTLY がトランザクション内で実行できないため
-- (20260711000003_vehicles_public_id_unique_index.sql と同じ作法)。
-- =============================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_part_installations_one_draft_per_reservation
  ON part_installations (reservation_id)
  WHERE status = 'draft' AND reservation_id IS NOT NULL;
