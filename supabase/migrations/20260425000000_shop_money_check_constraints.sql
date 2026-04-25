-- ============================================================
-- shop_products / shop_orders / shop_order_items の金額カラムに
-- 非負 CHECK 制約を NOT VALID で追加する。
-- 既存行のスキャンを避けるため VALIDATE CONSTRAINT は後続 migration で行う。
-- 参照: docs/operations/zero-downtime-migrations.md (rule 7)
-- ============================================================

-- shop_products
ALTER TABLE shop_products
  ADD CONSTRAINT shop_products_price_non_negative CHECK (price >= 0) NOT VALID;

ALTER TABLE shop_products
  ADD CONSTRAINT shop_products_min_quantity_positive CHECK (min_quantity >= 1) NOT VALID;

ALTER TABLE shop_products
  ADD CONSTRAINT shop_products_tax_rate_non_negative CHECK (tax_rate >= 0) NOT VALID;

-- shop_orders
ALTER TABLE shop_orders
  ADD CONSTRAINT shop_orders_subtotal_non_negative CHECK (subtotal >= 0) NOT VALID;

ALTER TABLE shop_orders
  ADD CONSTRAINT shop_orders_tax_non_negative CHECK (tax >= 0) NOT VALID;

ALTER TABLE shop_orders
  ADD CONSTRAINT shop_orders_total_non_negative CHECK (total >= 0) NOT VALID;

-- shop_order_items
ALTER TABLE shop_order_items
  ADD CONSTRAINT shop_order_items_quantity_positive CHECK (quantity >= 1) NOT VALID;

ALTER TABLE shop_order_items
  ADD CONSTRAINT shop_order_items_unit_price_non_negative CHECK (unit_price >= 0) NOT VALID;

ALTER TABLE shop_order_items
  ADD CONSTRAINT shop_order_items_amount_non_negative CHECK (amount >= 0) NOT VALID;

ALTER TABLE shop_order_items
  ADD CONSTRAINT shop_order_items_tax_rate_non_negative CHECK (tax_rate >= 0) NOT VALID;
