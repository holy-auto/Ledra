-- 20260614000000 で NOT VALID 追加した transport CHECK を検証する (フォローアップ)。
--
-- ゼロダウンタイム方針 (scripts/lint-migrations.js): NOT VALID で追加した制約は
-- 別マイグレーションの VALIDATE CONSTRAINT で検証する。VALIDATE は SHARE UPDATE
-- EXCLUSIVE (読み書き継続可) の軽量ロックで、ACCESS EXCLUSIVE を取らない。
-- 既存行は email/api/NULL のみで新 CHECK を満たすため即時完了する。冪等。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.purchase_orders'::regclass
      AND conname  = 'purchase_orders_transport_check'
      AND convalidated IS FALSE
  ) THEN
    ALTER TABLE purchase_orders VALIDATE CONSTRAINT purchase_orders_transport_check;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;  -- purchase_orders 未作成環境では何もしない
END $$;
