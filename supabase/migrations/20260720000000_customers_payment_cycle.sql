-- =============================================================
-- 顧客の支払いサイクル（締め日・支払サイト）と取引先テナント紐付け
--
-- 既存の customers.billing_cycle (per_job/consolidated) を「支払サイクルで
-- 請求書を自動生成」に接続するため、締め日・支払サイトを構造化して追加する。
-- あわせて、顧客が Ledra 利用店（取引先テナント）である場合の紐付けを持たせ、
-- BtoB 指名オーダー → 顧客（＝相手テナント）の解決に使う。
--
--   closing_day        : 締め日 (1-31, 31=末締め扱い)。NULL は締め日未設定＝都度扱い。
--   payment_terms_days : 支払サイト (net-N 日数, 例 30)。NULL は既定 30 日で計算。
--   linked_tenant_id   : この顧客が Ledra 利用店であるときの tenants.id。
--                        受注側 customers から from_tenant_id を引き当てるのに使う。
-- =============================================================

alter table customers
  add column if not exists closing_day integer
    check (closing_day is null or (closing_day >= 1 and closing_day <= 31));

alter table customers
  add column if not exists payment_terms_days integer
    check (payment_terms_days is null or (payment_terms_days >= 0 and payment_terms_days <= 180));

alter table customers
  add column if not exists linked_tenant_id uuid references tenants(id) on delete set null;

comment on column customers.closing_day is
  '締め日 (1-31, 31=末締め)。NULL=締め日未設定（都度扱い）。合算請求の期間境界に使う。';
comment on column customers.payment_terms_days is
  '支払サイト (net-N 日数, 例 30)。NULL は既定 30 日。締め日 + N で支払期限を算出。';
comment on column customers.linked_tenant_id is
  'この顧客が Ledra 利用店（取引先テナント）であるときの tenants.id。BtoB 指名請求の顧客解決に使う。';

-- 索引は CONCURRENTLY のため別ファイル (20260720000003_customers_linked_tenant_index.sql)。
