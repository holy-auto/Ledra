-- certificates.customer_id の索引（元: 20260313000000）。
-- CONCURRENTLY はトランザクション内で実行できないため、規約どおり別ファイルに分ける
-- （`npm run lint:migrations` が見ている）。本番では既にあるので no-op。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certificates_customer
  ON public.certificates (customer_id);
