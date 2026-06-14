-- 供給パートナーポータル Phase 2 — メーカーが自分宛てのポータル発注を閲覧する RLS。
--
-- purchase_orders / purchase_order_items は既存では tenant スコープの SELECT のみ
-- (店舗だけが見える)。メーカー (my_supply_partner_ids) が「自分が供給先で、かつ
-- transport='portal' の発注」を受信トレイで読めるよう、パートナー視点の SELECT
-- ポリシーを追加する (OR で既存テナントポリシーと併存)。
--
-- 書き込みは付与しない: メーカーの回答はサーバ API (service-role) 経由でのみ行い、
-- 20260614000000 のガードトリガが tenant/クライアント直叩きの回答列変更を差し戻す。
-- email/api 発注はポータルに出さない (transport='portal' 限定) ため、ここで露出する
-- のはポータル運用の発注のみ。

-- ── purchase_orders: パートナー視点の SELECT ──────────────────────────────────
DROP POLICY IF EXISTS "purchase_orders_select_partner" ON purchase_orders;
CREATE POLICY "purchase_orders_select_partner" ON purchase_orders
  FOR SELECT USING (
    transport = 'portal'
    AND supply_partner_id IN (SELECT my_supply_partner_ids())
  );

-- ── purchase_order_items: 親 PO がパートナー宛てポータル発注なら閲覧可 ──────────
-- 親 purchase_orders には上の partner ポリシーがあるため、この副問い合わせは
-- メーカーから見える PO (= 自分宛てポータル発注) のみを返す。
DROP POLICY IF EXISTS "po_items_select_partner" ON purchase_order_items;
CREATE POLICY "po_items_select_partner" ON purchase_order_items
  FOR SELECT USING (
    po_id IN (
      SELECT id FROM purchase_orders
      WHERE transport = 'portal'
        AND supply_partner_id IN (SELECT my_supply_partner_ids())
    )
  );
