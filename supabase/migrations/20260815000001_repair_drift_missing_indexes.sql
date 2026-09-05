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
-- ドリフト修復: 記録済みなのに本番に存在しなかった索引3本の再作成
--
-- 20260815000000 の続き。いずれも `schema_migrations` に「適用済み」と記録されて
-- いるのに、本番 (cahybswpduchptvyvdkk) に索引が存在しなかった。
--
--   20260710000002  idx_square_orders_receipt_document
--   20260711000003  idx_vehicles_public_id                          (UNIQUE)
--   20260714000002  idx_part_installations_one_draft_per_reservation (UNIQUE)
--
-- 索引を列と別ファイルに分けているのは、CREATE INDEX が
-- CONCURRENTLY だったため（元の3ファイルと同じ作法。2026-09-04 に外した）。
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

CREATE INDEX IF NOT EXISTS idx_square_orders_receipt_document
  ON square_orders(receipt_document_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_public_id
  ON vehicles (public_id)
  WHERE public_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_part_installations_one_draft_per_reservation
  ON part_installations (reservation_id)
  WHERE status = 'draft' AND reservation_id IS NOT NULL;
