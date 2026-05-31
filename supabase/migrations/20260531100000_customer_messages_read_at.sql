-- =============================================================
-- customer_messages.read_at: スタッフ既読管理
--
-- 横断的な会話受信箱 (/admin/messages) で「未読」をトリアージするための列。
--   - inbound (顧客発) のメッセージが read_at IS NULL のとき「未読」とみなす。
--   - スタッフがスレッドを開いた時点で、そのスレッドの inbound 未読を一括既読化する。
--   - outbound (店舗発) は概念上常に既読 (自分が送ったもの) なので未読カウントに含めない。
--
-- nullable で追加 (既存行は NULL = 未読扱いだが、過去分を一括既読にしたい場合は
-- 別途 UPDATE 可能)。zero-downtime: ADD COLUMN nullable のみ。
-- =============================================================

ALTER TABLE customer_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

COMMENT ON COLUMN customer_messages.read_at IS
  'スタッフが既読にした時刻。inbound かつ NULL のとき受信箱で未読バッジ対象。outbound は未読カウント対象外。';

-- NOTE: 未読 inbound カウント用の部分インデックスは、既存テーブルへの追加で
-- CONCURRENTLY 必須 (lint-migrations) かつ CONCURRENTLY はトランザクション内で
-- 実行できないため、ここでは作らない。既存の idx_customer_messages_thread_by_*
-- / idx_customer_messages_unmatched (tenant_id, created_at) で当面のカウントは
-- 賄える。件数増で必要になった時点で別マイグレーションで CONCURRENTLY 付き追加する。
