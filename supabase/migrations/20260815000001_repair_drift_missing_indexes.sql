-- =============================================================
-- ドリフト修復: 記録済みなのに本番に存在しなかった索引3本の再作成
--
-- 20260815000000 の続き。いずれも `schema_migrations` に「適用済み」と記録されて
-- いるのに、本番 (cahybswpduchptvyvdkk) に索引が存在しなかった。
--
--   20260710000002  idx_square_orders_receipt_document
--   20260711000003  idx_vehicles_public_id                          (UNIQUE)
--   20260714000002  idx_part_installations_one_draft_per_reservation (UNIQUE)
--
-- 索引を列と別ファイルに分けているのは、CREATE INDEX CONCURRENTLY が
-- トランザクション内で実行できないため（元の3ファイルと同じ作法）。
-- CONCURRENTLY 自体は本番で正常に動いている: リポジトリ全体の CONCURRENTLY 索引
-- 180本のうち欠落はこの3本だけで、いずれも上記の「記録済み・未実行」の
-- マイグレーションに属する。つまり CONCURRENTLY が原因ではない。
--
-- UNIQUE 2本は既存データに重複が無いことを本番で確認済み（どちらも0件）なので、
-- そのまま作成できる。IF NOT EXISTS で再実行に耐える。
--
-- 影響（なぜ索引まで直すか）:
--   idx_part_installations_one_draft_per_reservation は単なる性能用ではない。
--   src/lib/parts/installationService.ts が「予約あたり下書き1件」の冪等性を
--   この一意制約違反 (23505) に依存して担保しているため、索引が無いと
--   二重タップ・オフライン再送で下書きが複数できる。
--   idx_vehicles_public_id も NFC/QR の解決に使う識別子の一意性そのもの。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_square_orders_receipt_document
  ON square_orders(receipt_document_id);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_vehicles_public_id
  ON vehicles (public_id)
  WHERE public_id IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_part_installations_one_draft_per_reservation
  ON part_installations (reservation_id)
  WHERE status = 'draft' AND reservation_id IS NOT NULL;
