-- 20260710〜20260717 のドリフト修復（本番 cahybswpduchptvyvdkk）
--
-- 事象:
--   下記 6 本が supabase_migrations.schema_migrations に「適用済み」として
--   記録されていたにもかかわらず、DDL は本番に一切反映されていなかった
--   （列3つ・索引3つ）。索引3本は CONCURRENTLY のため 20260815000001 で作る。
--     - 20260710000001_square_orders_receipt_link            → square_orders.receipt_document_id
--     - 20260710000002_square_orders_receipt_link_index      → idx_square_orders_receipt_document
--     - 20260711000003_vehicles_public_id_unique_index       → idx_vehicles_public_id
--     - 20260714000002_part_installations_one_draft_..._index → idx_part_installations_one_draft_per_reservation
--     - 20260716000000_reservations_ai_assignee_suggestion   → reservations.ai_assignee_suggestion
--     - 20260717000000_certificates_damage_map               → certificates.damage_map_json
--
--   このうち certificates.damage_map_json の欠落により、証明書の新規発行
--   （src/app/admin/certificates/new/actions.ts の insert は damage_map_json を
--   常に含む）が PostgREST の
--     "Could not find the 'damage_map_json' column of 'certificates' in the schema cache"
--   で全件失敗していた。傷マップを使っていない発行でも落ちる（キーを常に送るため）。
--
-- 対応:
--   20260731144359_repair_20260715_batch_drift.sql と同じ方式。既に記録済みの
--   バージョンは通常の migration では再実行されないため、欠落した DDL を冪等
--   （IF NOT EXISTS）にまとめて再適用する。正しく適用済みの環境では no-op。
--   ※ 元のファイルは変更しない（履歴の再現性を保つため）。
--
--   索引は元は CREATE INDEX CONCURRENTLY だったため（2026-09-04 に外した）、
--   別ファイル（20260815000001_repair_drift_missing_indexes.sql）に分ける。
--
--   欠落の洗い出しは、リポジトリのマイグレーションを機械パースして得た期待値を
--   本番の information_schema / pg_class と突合して行った（テーブル250・列472・
--   CONCURRENTLY索引180）。この範囲での欠落は上記6本のみ。
--   RLSポリシー・CHECK制約・関数は未突合（OPEN_QUESTIONS 起票済み）。
--
-- 適用経路について:
--   この修復が本番へ届くには db-migrate ワークフローが緑である必要があるが、
--   同ワークフローは 2026-08-02 以降 `supabase db push` の
--   "Remote migration versions not found in local migrations directory." で
--   失敗し続けていた（OPEN_QUESTIONS 2026-08-05 追記）。本PRで、本番履歴にしか
--   存在しなかった 20260802154302 / 20260802154541 / 20260804064418 の3件を
--   リポジトリ側に揃え（改名＋本番 statements からの復元）、あわせて
--   out-of-order だった vehicle_report 系2本を後ろの日付へ改名して解消している。


-- ===== re-apply: 20260710000001_square_orders_receipt_link.sql =====
-- Square 売上から作成した領収書 (documents) へのリンク。
ALTER TABLE square_orders
  ADD COLUMN IF NOT EXISTS receipt_document_id uuid REFERENCES documents(id) ON DELETE SET NULL;

-- ===== re-apply: 20260716000000_reservations_ai_assignee_suggestion.sql =====
-- 入庫時に自動算出する担当メカニック候補提案（提案のみ・割当確定は人）。
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS ai_assignee_suggestion jsonb;

COMMENT ON COLUMN reservations.ai_assignee_suggestion IS
  'mechanic.auto_assign_suggest が入庫時に保存する担当メカニック候補 (candidates[{staff_id,name,score,method,reason}]/ai/service_type/generated_at)。提案のみ・割当確定は人。';

-- ===== re-apply: 20260717000000_certificates_damage_map.sql =====
-- 傷・損傷位置マップ（車両展開図へタップで置いたマーカー群）。
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS damage_map_json jsonb;

COMMENT ON COLUMN certificates.damage_map_json IS
  '傷・損傷位置マップ { version, markers:[{id,x,y,kind,note}] }（x,y は車両図 viewBox の 0..1 正規化座標）。DamageMapSection が保存。';
