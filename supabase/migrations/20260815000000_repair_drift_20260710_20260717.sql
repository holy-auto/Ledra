-- 20260710〜20260717 のドリフト修復（本番 cahybswpduchptvyvdkk）
--
-- 事象:
--   下記 3 本が supabase_migrations.schema_migrations に「適用済み」として
--   記録されていたにもかかわらず、DDL は本番に一切反映されていなかった。
--     - 20260710000001_square_orders_receipt_link      → square_orders.receipt_document_id
--     - 20260710000002_square_orders_receipt_link_index → idx_square_orders_receipt_document
--     - 20260716000000_reservations_ai_assignee_suggestion → reservations.ai_assignee_suggestion
--     - 20260717000000_certificates_damage_map          → certificates.damage_map_json
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
--   索引 idx_square_orders_receipt_document は CREATE INDEX CONCURRENTLY が
--   トランザクション内で実行できないため、別ファイル（20260815000001）に分ける。
--
-- 再発防止:
--   .github/workflows/db-migrate.yml の `supabase db push` に `--include-all` を
--   付与した。既定の push は「リモート履歴の最新より古い未適用マイグレーション」を
--   黙って除外するため、後から古いタイムスタンプで入ったファイルが永久に
--   適用されない状態になっていた（20260730100000 / 20260730200000 /
--   20260802000000 が実際にこの状態だった）。


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
