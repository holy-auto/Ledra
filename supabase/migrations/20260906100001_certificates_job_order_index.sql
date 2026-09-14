-- 【2026-09-04 / 09-05 / 09-06 ×2 と4回改名】元のファイル名は 20260901000002 だった。base（main）の最新と本番の適用済み最新は**別の値**で、どちらより後にする必要がある。
-- 2026-09-06 時点で base = 20260906000003（このファイル自身の旧版。#1020 マージ済み）、
-- 本番 = 20260906094735（#966 が apply_migration で本番へ直接当てた版。main には無い）。
-- 20260906100000 台はその両方より後。
-- **lint の migration-version-before-base-head は base としか比べない。**
-- 本番へ直接適用された版は見えないので、改名時は台帳も引くこと（M-045）。
-- 古いバージョンの未適用ファイルがあると
-- `supabase db push` が out-of-order で停止し、以降のマイグレーションが本番へ
-- 一切届かなくなる（.github/workflows/db-migrate.yml の不変条件2）。
-- 本番の schema_migrations に 20260901000002 が無いことを名指しで確認したうえで改名した
-- （適用済みを改名すると不変条件1に抵触する）。
-- `npm run lint:migrations` の migration-version-before-base-head が静的に見ている。
-- =============================================================
-- certificates.job_order_id 索引 (CONCURRENTLY)
--
-- /admin/orders/[id] が発注に紐づく施工証明を引く（受発注の双方が見る画面）ための
-- ルックアップ用。別ファイルにしたのは CREATE INDEX CONCURRENTLY がトランザクション内で
-- 実行できないため（20260720000003 と同作法）。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certificates_job_order
  ON certificates (job_order_id)
  WHERE job_order_id IS NOT NULL;
