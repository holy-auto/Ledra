-- ============================================================
-- 20260425000000 で NOT VALID 追加した shop 関連 CHECK 制約を VALIDATE する。
-- VALIDATE CONSTRAINT は SHARE UPDATE EXCLUSIVE で同時書込みを止めない。
-- 既存行に違反があれば失敗するので、その場合は事前にデータ修正が必要。
-- ============================================================

ALTER TABLE shop_products VALIDATE CONSTRAINT shop_products_price_non_negative;
ALTER TABLE shop_products VALIDATE CONSTRAINT shop_products_min_quantity_positive;
ALTER TABLE shop_products VALIDATE CONSTRAINT shop_products_tax_rate_non_negative;

ALTER TABLE shop_orders VALIDATE CONSTRAINT shop_orders_subtotal_non_negative;
ALTER TABLE shop_orders VALIDATE CONSTRAINT shop_orders_tax_non_negative;
ALTER TABLE shop_orders VALIDATE CONSTRAINT shop_orders_total_non_negative;

ALTER TABLE shop_order_items VALIDATE CONSTRAINT shop_order_items_quantity_positive;
ALTER TABLE shop_order_items VALIDATE CONSTRAINT shop_order_items_unit_price_non_negative;
ALTER TABLE shop_order_items VALIDATE CONSTRAINT shop_order_items_amount_non_negative;
ALTER TABLE shop_order_items VALIDATE CONSTRAINT shop_order_items_tax_rate_non_negative;
