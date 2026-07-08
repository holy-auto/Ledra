-- =============================================================================
-- LINE 顧客紐づけ — 新規顧客の登録導線 (intake) と連携案内トグル
--
-- 設計: LINE 公式アカウントは店から先に送れず必ず顧客発でやり取りが始まる。
-- 未紐づけのまま会話が始まるため、案内 → (既存=連携コード / 新規=登録フォーム) で
-- 紐づけへ誘導し、紐づけ完了時に過去メッセージを backfill + 予約候補を一括取り込みする。
--
--   1. customer_intake_invitations.line_user_id
--      新規顧客向けに発行した登録フォーム招待に LINE userId を紐づけておき、
--      フォーム完了 (customers 作成) 時に自動で customers.line_user_id をセットする。
--   2. tenants.line_link_prompt_enabled
--      未紐づけ受信時に「連携を促す案内」を自動返信するかのテナント別トグル
--      (AI マスタースイッチとは独立。既定 OFF)。
-- =============================================================================

ALTER TABLE customer_intake_invitations
  ADD COLUMN IF NOT EXISTS line_user_id text;

COMMENT ON COLUMN customer_intake_invitations.line_user_id IS
  '新規顧客の登録フォームに紐づけた LINE userId。フォーム完了時に customers.line_user_id へ転記し、過去メッセージの backfill と履歴一括取り込みを起動する。';

-- line_user_id の索引は CONCURRENTLY のため companion migration
-- (20260630000002_intake_line_user_index.sql) に分離する。

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS line_link_prompt_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.line_link_prompt_enabled IS
  '未紐づけの LINE ユーザーから受信した際に「連携を促す案内」を自動返信するか。既定 OFF。';
