-- 外注職人への内部請求（下請け精算）機能
--
-- 背景:
--   外注職人 (staff_members, kind='external') はログインアカウントを持たず、
--   顧客向け帳票を自ら発行することはできない。一方でテナント側が「この外注職人に
--   いくら支払うか」を管理するため、職人ごとの手数料率（レス率）を設定し、
--   それを自動適用した内部請求書（documents.doc_type='staff_invoice'）を
--   テナント管理者が代理作成できるようにする。
--
-- 設計（既存を壊さない / 追加のみ）:
--   - staff_members.commission_rate: 職人ごとのデフォルトレス率（0〜1）。
--   - documents.doc_type に 'staff_invoice' を追加、documents.staff_member_id で
--     対象の外注職人を指す（customer_id は使わず staff_member_id を使う）。
--   - 金銭データのため、staff_invoice 行だけは RESTRICTIVE ポリシーで
--     管理ロール（super_admin/owner/admin）に限定する。

-- ─── staff_members.commission_rate（レス率） ─────────────────────────────────
-- 新規の nullable カラムで、既存行は全て NULL のため CHECK は即座に検証を通過する
-- （staff_members.assigned_staff_id 追加時と同じ「全行 NULL への inline 制約」パターン）。
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS commission_rate numeric
  CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1));

COMMENT ON COLUMN staff_members.commission_rate IS
  'レス率（0〜1）。外注請求書 (documents.doc_type=staff_invoice) 作成時の金額自動計算に使うデフォルト値。';

-- ─── documents.doc_type に 'staff_invoice' を追加 ────────────────────────────
-- 既存行がある本番テーブルの CHECK 差し替えのため、lint-migrations の
-- add-check-without-not-valid 規約に従い NOT VALID → VALIDATE CONSTRAINT に分割する。
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN (
    'estimate', 'delivery', 'purchase_order', 'order_confirmation',
    'inspection', 'receipt', 'invoice', 'consolidated_invoice', 'staff_invoice'
  ))
  NOT VALID;

ALTER TABLE documents
  VALIDATE CONSTRAINT documents_doc_type_check;

-- ─── documents.staff_member_id（外注請求書の宛先） ───────────────────────────
-- 新規カラム（全行 NULL）への inline REFERENCES なので FK 検証は即時・安全
-- （staff_members.assigned_staff_id 追加時と同じパターン）。検索用インデックスは
-- 必要になった時点で別マイグレーション（CONCURRENTLY）で張る。
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN documents.staff_member_id IS
  '外注請求書 (doc_type=staff_invoice) の宛先となる外注職人。顧客向け帳票では常に NULL。';

-- ─── staff_invoice 行を管理ロール限定にする RESTRICTIVE ポリシー ─────────────
-- documents_tenant_* は PERMISSIVE（テナット全メンバーに開放）のため、
-- 上乗せで絞るには RESTRICTIVE ポリシーが必要（RESTRICTIVE は AND 条件で効く）。
-- staff_invoice 以外の行は常に true（no-op）、staff_invoice 行だけ管理ロールを要求する。
DROP POLICY IF EXISTS documents_staff_invoice_restrict ON documents;
CREATE POLICY documents_staff_invoice_restrict ON documents
  AS RESTRICTIVE
  FOR ALL
  USING (doc_type != 'staff_invoice' OR public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']))
  WITH CHECK (doc_type != 'staff_invoice' OR public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));
