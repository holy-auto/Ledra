-- 【2026-09-04 改名】元のファイル名は 20260903000002 だった。本番の適用済み最新は
-- 20260904123252 で、それより古いバージョンの未適用ファイルがあると
-- `supabase db push` が out-of-order で停止し、以降のマイグレーションが本番へ
-- 一切届かなくなる（.github/workflows/db-migrate.yml の不変条件2）。
-- 本番の schema_migrations に 20260903000002 が無いことを名指しで確認したうえで改名した
-- （適用済みを改名すると不変条件1に抵触する）。
-- `npm run lint:migrations` の migration-version-before-base-head が静的に見ている。
-- =============================================================
-- staff_members.linked_tenant_id 索引 (CONCURRENTLY)
--
-- 外注テナントが「自分が作業した記録」を引くとき、全元請けを横断して
-- linked_tenant_id = 自分 の職人行を探す。その逆引き用。
-- 別ファイルにしたのは CREATE INDEX CONCURRENTLY がトランザクション内で
-- 実行できないため（20260720000003 と同作法）。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_members_linked_tenant
  ON staff_members (linked_tenant_id)
  WHERE linked_tenant_id IS NOT NULL;
