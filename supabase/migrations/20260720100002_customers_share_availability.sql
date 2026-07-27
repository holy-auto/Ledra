-- =============================================================
-- customers.share_availability — 取引先への空き公開 kill-switch
--
-- 取引先(customers.linked_tenant_id で紐付いた Ledra 利用店)に自店の空き状況を
-- 公開するかどうか。既定 true（＝顧客として登録した時点で許可の意）。B が個別に
-- false にすれば、その取引先からは空き参照・枠押さえができなくなる。
-- =============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS share_availability boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN customers.share_availability IS
  '取引先(linked_tenant_id)への空き公開可否。既定 true。false で空き参照・枠押さえを拒否。';
