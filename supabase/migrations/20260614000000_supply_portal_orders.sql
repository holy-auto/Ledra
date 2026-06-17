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
--
-- ゼロダウンタイム方針 (scripts/lint-migrations.js): CHECK は NOT VALID で追加し、
-- 既存行のスキャン (ACCESS EXCLUSIVE 保持) を避ける。検証は後続マイグレーション
-- 20260614000001 の VALIDATE CONSTRAINT (軽量ロック) で行う。既存行は email/api/NULL
-- のみで新 CHECK を必ず満たすため検証は即時完了する。
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
    CHECK (transport IN ('email', 'api', 'portal')) NOT VALID;
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

-- ═══ ⑤ メーカー回答列をテナント側書き込みから保護 (壁3 / source of truth 保護) ═════
-- purchase_orders は tenant スコープの RLS で、テナントメンバーは行を INSERT/UPDATE
-- できる (発注作成・note 編集・承認など)。だが partner_response 系はメーカーの回答で
-- あり、テナント (店舗ユーザー / クライアント直叩き) に書かせてはいけない。
-- supply_partners の guard_protected_cols と同じ作法で、service-role (auth.uid() IS NULL)
-- 以外による INSERT/UPDATE では:
--   - UPDATE: これら列の変更を差し戻す (OLD 値を維持)。
--   - INSERT: NULL に固定する (作成時に回答を仕込めない)。
-- メーカーの回答書き込みはサーバ API (service-role) 経由のみ。
CREATE OR REPLACE FUNCTION purchase_orders_guard_partner_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.partner_response      := OLD.partner_response;
      NEW.partner_responded_at  := OLD.partner_responded_at;
      NEW.partner_ship_eta      := OLD.partner_ship_eta;
      NEW.partner_tracking_no   := OLD.partner_tracking_no;
      NEW.partner_response_note := OLD.partner_response_note;
      NEW.decline_reason        := OLD.decline_reason;
    ELSE  -- INSERT
      NEW.partner_response      := NULL;
      NEW.partner_responded_at  := NULL;
      NEW.partner_ship_eta      := NULL;
      NEW.partner_tracking_no   := NULL;
      NEW.partner_response_note := NULL;
      NEW.decline_reason        := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_guard_partner_response ON purchase_orders;
CREATE TRIGGER trg_purchase_orders_guard_partner_response
  BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION purchase_orders_guard_partner_response();

-- ═══ ⑥ 明細の受注/欠品数量も同様に保護 ════════════════════════════════════════
-- accepted_quantity / backorder_quantity は partial/declined 回答時にメーカーが
-- 確定する supplier-owned な状態。po_items_update (tenant) で書き換えられないよう、
-- ④ と同じく service-role 以外の書き込みを差し戻す/NULL 固定する。
-- (quantity / received / unit_cost 等の既存列は従来どおりテナントが編集可。)
CREATE OR REPLACE FUNCTION purchase_order_items_guard_response_qty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.accepted_quantity  := OLD.accepted_quantity;
      NEW.backorder_quantity := OLD.backorder_quantity;
    ELSE  -- INSERT
      NEW.accepted_quantity  := NULL;
      NEW.backorder_quantity := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_items_guard_response_qty ON purchase_order_items;
CREATE TRIGGER trg_po_items_guard_response_qty
  BEFORE INSERT OR UPDATE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION purchase_order_items_guard_response_qty();
