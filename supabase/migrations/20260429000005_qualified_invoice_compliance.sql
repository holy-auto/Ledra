-- Qualified Invoice (適格請求書) compliance — phase 1
--
-- 背景:
--   Ledra は documents テーブルに `is_invoice_compliant`, `tax_rate` (10/8) を
--   既に持つが、複数税率（標準10% + 軽減8%）が同一書類に混在するケースで
--   税率ごとの内訳が記録できない。インボイス制度（令和5年10月施行）の
--   要件「税率ごとに区分した対価の額・消費税額」を満たすため、
--   1) tenants.registration_number に "T+13桁" のフォーマット制約
--   2) documents.tax_breakdown jsonb で税率ごとの小計・消費税額を保持
--   を追加する。
--
-- 互換性:
--   - tax_breakdown は NULL 許容。NULL の書類は単一税率 (tax_rate) のみで集計
--     される従来挙動。
--   - 登録番号 CHECK は NULL またはフォーマット一致を許可。既存の登録番号は
--     T+13 桁チェックを通過する想定だが、フォーマット違反の既存行があると
--     ALTER 失敗するため NOT VALID で追加し、admin オペレーションで個別に
--     VALIDATE する手順とする。

-- ── 1. 適格請求書発行事業者登録番号フォーマット制約 ──
-- T + 13 桁の数字（例: T1234567890123）。NULL は許容（未登録事業者）。
alter table public.tenants
  drop constraint if exists tenants_registration_number_format;

alter table public.tenants
  add constraint tenants_registration_number_format
  check (registration_number is null or registration_number ~ '^T[0-9]{13}$')
  not valid;

comment on constraint tenants_registration_number_format on public.tenants is
  '適格請求書発行事業者登録番号は T+13桁の数字。NULL 許容。NOT VALID で追加されているため、既存行を一括検証する場合は ALTER ... VALIDATE CONSTRAINT を別途実行。';

-- ── 2. 税率ごとの内訳カラム ──
alter table public.documents
  add column if not exists tax_breakdown jsonb;

comment on column public.documents.tax_breakdown is
  '税率ごとの内訳。形式: [{"rate": 10, "subtotal": 12345, "tax": 1234}, {"rate": 8, "subtotal": 6000, "tax": 480}]。NULL の場合は単一税率 (tax_rate) で集計。';

-- 軽量チェック: 配列または NULL のみ許可（要素のスキーマ検証は app 側）
alter table public.documents
  drop constraint if exists documents_tax_breakdown_shape;

alter table public.documents
  add constraint documents_tax_breakdown_shape
  check (
    tax_breakdown is null
    or jsonb_typeof(tax_breakdown) = 'array'
  );
