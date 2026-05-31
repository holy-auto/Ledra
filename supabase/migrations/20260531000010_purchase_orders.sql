-- 仕入先 + 発注 (purchase order) の基盤テーブル。
--
-- 背景: 在庫 (inventory_items) と低在庫検知 (cron/low-stock-alerts) は既にあるが、
-- 「発注」を表現する基盤が無かった。auto-action `inventory.auto_draft_reorder` が
-- opt-in されているテナントでは、低在庫品目から **発注書を status=draft で自動起票**
-- する。発注の確定・送信 (= 仕入先への金額コミット) は必ず人が承認してから行う。
--
-- 壁3 との整合: 自動で作るのは draft のみ。approve / send (外部への発注確定) は人。

-- ─── suppliers (仕入先マスタ) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  email           text,
  phone           text,
  note            text,
  lead_time_days  integer,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_active ON suppliers(tenant_id, is_active);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
CREATE POLICY "suppliers_select" ON suppliers
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "suppliers_insert" ON suppliers;
CREATE POLICY "suppliers_insert" ON suppliers
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;
CREATE POLICY "suppliers_update" ON suppliers
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "suppliers_delete" ON suppliers;
CREATE POLICY "suppliers_delete" ON suppliers
  FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()));

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── inventory_items に発注用の補助列を追加 ──────────────────────────────────
-- supplier_id: 既定の仕入先 / reorder_qty: 1 回あたりの既定発注数 / supplier_sku: 先方品番
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS supplier_id  uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reorder_qty  numeric(12,2),
  ADD COLUMN IF NOT EXISTS supplier_sku text;

-- NOTE: supplier_id の検索用インデックスは既存テーブル (inventory_items) への追加で
-- CONCURRENTLY 必須 (lint-migrations) のため、必要になった時点で別マイグレーションで
-- CONCURRENTLY 付きで追加する。現状の自動発注は tenant_id/is_active/min_stock で絞るため不要。

-- ─── purchase_orders (発注) ──────────────────────────────────────────────────
-- status: draft (下書き) → approved (承認) → sent (発注送信) → received (入荷) / cancelled
-- source: auto (自動起票) / manual (手動)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id   uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  po_number     text,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','approved','sent','received','cancelled')),
  source        text NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('auto','manual')),
  note          text,
  subtotal      integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at   timestamptz,
  sent_at       timestamptz,
  received_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant ON purchase_orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_status ON purchase_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id) WHERE supplier_id IS NOT NULL;

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;
CREATE POLICY "purchase_orders_select" ON purchase_orders
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "purchase_orders_insert" ON purchase_orders;
CREATE POLICY "purchase_orders_insert" ON purchase_orders
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;
CREATE POLICY "purchase_orders_update" ON purchase_orders
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "purchase_orders_delete" ON purchase_orders;
CREATE POLICY "purchase_orders_delete" ON purchase_orders
  FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()));

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── purchase_order_items (発注明細) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_id        uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id      uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  name         text NOT NULL,
  sku          text,
  quantity     numeric(12,2) NOT NULL CHECK (quantity > 0),
  unit_cost    integer,
  amount       integer NOT NULL DEFAULT 0,
  received     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_tenant ON purchase_order_items(tenant_id);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "po_items_select" ON purchase_order_items;
CREATE POLICY "po_items_select" ON purchase_order_items
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "po_items_insert" ON purchase_order_items;
CREATE POLICY "po_items_insert" ON purchase_order_items
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "po_items_update" ON purchase_order_items;
CREATE POLICY "po_items_update" ON purchase_order_items
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "po_items_delete" ON purchase_order_items;
CREATE POLICY "po_items_delete" ON purchase_order_items
  FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()));

-- 自動起票の冪等性: 1 仕入先につき同時に存在する auto 下書きは 1 つに制限する
-- (毎日 cron が走っても重複 draft を作らない)。手動 draft は対象外。
CREATE UNIQUE INDEX IF NOT EXISTS uq_po_auto_open_per_supplier
  ON purchase_orders(tenant_id, supplier_id)
  WHERE source = 'auto' AND status = 'draft';

COMMENT ON TABLE purchase_orders IS
  '発注。auto-action inventory.auto_draft_reorder は status=draft / source=auto で自動起票。承認・送信 (外部コミット) は必ず人。';
