-- 空 DB 用の補い: 20260318000000 が張るはずだった索引を、
-- customer_login_codes が出来たこの位置で張る（本番では既にあるので no-op）。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_login_codes_tenant_email
  ON public.customer_login_codes (tenant_id, email, expires_at DESC);
