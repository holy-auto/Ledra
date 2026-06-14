-- 供給パートナーポータル (メーカー受注ポータル) Phase 1 — データモデル。
--
-- 背景 (docs/internal/supplier-portal-design.md):
--   API を持たないメーカー向けに Ledra がホストする受注ポータルを提供する。
--   発注を transport='portal' で「積む」→ メーカーがログインして受注/欠品/辞退/
--   出荷予定を構造化回答する。メール発注の「送りっぱなし」を双方向に置き換える。
--
-- 壁3 との整合: ここは schema のみ (additive・冪等)。送信 (sent) / 全自動送信は
--   引き続き decideAutoSend() の全条件を満たすときのみ。回答列はメーカーが
--   ポータルから更新するが、金額・明細は触らせない (API 層 + RLS で列を絞る)。
--
-- 既存 supply_partners は platform スコープ (テナント横断) のため、メーカー本体の
-- 横断アカウントは新設不要。本ファイルは既存テーブルへの列追加のみ。

-- ═══ ① purchase_orders.transport に 'portal' を追加 (CHECK 再定義) ═══════════════
-- 元の列は 20260601000000 で `CHECK (transport IN ('email','api'))` を inline 付与。
-- 制約名は自動生成 (purchase_orders_transport_check)。冪等に drop → re-add する。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.purchase_orders'::regclass
      AND conname  = 'purchase_orders_transport_check'
  ) THEN
    ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_transport_check;
  END IF;
  ALTER TABLE purchase_orders
    ADD CONSTRAINT purchase_orders_transport_check
    CHECK (transport IN ('email', 'api', 'portal'));
EXCEPTION
  WHEN undefined_table THEN NULL;  -- purchase_orders 未作成環境では何もしない
END $$;

-- ═══ ② purchase_orders にメーカーの回答列を追加 ════════════════════════════════
-- partner_response: ポータルでのメーカー回答 (送信時は pending)。
--   pending  = ポータルに積まれたが未回答
--   accepted = 全量受注
--   partial  = 一部欠品 (行ごとの accepted_quantity を参照)
--   declined = 辞退 (decline_reason を参照)
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS partner_response       text
    CHECK (partner_response IN ('pending', 'accepted', 'partial', 'declined')),
  ADD COLUMN IF NOT EXISTS partner_responded_at   timestamptz,
  ADD COLUMN IF NOT EXISTS partner_ship_eta       date,
  ADD COLUMN IF NOT EXISTS partner_tracking_no    text,
  ADD COLUMN IF NOT EXISTS partner_response_note  text,
  ADD COLUMN IF NOT EXISTS decline_reason         text
    CHECK (decline_reason IN ('discontinued', 'out_of_stock', 'price_mismatch', 'min_lot', 'other'));

COMMENT ON COLUMN purchase_orders.partner_response IS
  'メーカーのポータル回答 (pending/accepted/partial/declined)。transport=portal の発注で使用。';

-- ═══ ③ purchase_order_items に行ごとの回答数量を追加 ════════════════════════════
-- accepted_quantity : メーカーが受けた数量 (partial 時に quantity 未満になり得る)。
-- backorder_quantity: 欠品分 = quantity - accepted_quantity。再発注は自動化しない (人の承認)。
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS accepted_quantity  numeric(12,2),
  ADD COLUMN IF NOT EXISTS backorder_quantity numeric(12,2);

-- ═══ ④ supply_partners にポータル/通知の列を追加 ═══════════════════════════════
-- portal_enabled: API を持たないメーカーがポータル受注を使うか (本人が opt-in 可)。
-- line_user_id  : プラットフォーム共通 Ledra 公式 LINE での通知先 (Phase 4)。
ALTER TABLE supply_partners
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS line_user_id   text;

COMMENT ON COLUMN supply_partners.portal_enabled IS
  'メーカーが Ledra ホストの受注ポータルを使うか。true なら API 無しでも transport=portal の対象。';
