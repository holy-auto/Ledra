-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- **CONCURRENTLY を外した。** Supabase のブランチ機能はマイグレーションの複数文を
-- パイプラインで送るため、2文目以降の CONCURRENTLY が
-- `CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)`
-- で落ちる。CONCURRENTLY が要るのは「書き込みが走っている本番のテーブルをロックしない」
-- ためで、このファイルは本番では再適用されず、空 DB では対象テーブルが空なので
-- ロックの問題は起きない。
-- 新しいファイルで CONCURRENTLY を使うときは **1ファイル1文** にすること
-- （`npm run lint:migrations` の concurrently-in-multi-statement-file が見ている）。
-- =============================================================
-- ダッシュボード/リマインド集計クエリ向けの支援索引
--
-- 「次の接触」(/admin/next-touch) と「通知配信状況」(/admin/notification-logs) の
-- 集計は、テナント横断の範囲/存在フィルタで既存テーブルを走査する。以下の列には
-- 支援索引が無く seq scan になりうるため、部分索引を張る。
--
-- 元は CREATE INDEX CONCURRENTLY のため（このファイルは 2026-09-04 に CONCURRENTLY を外した。冒頭の注を参照）、既存テーブル
-- (通常運用で書き込まれる) への索引追加は本ファイルに集約する。
-- =============================================================

-- (1) next-touch: 保証満了が近い証明書の抽出
--     certificates.eq(tenant_id).neq(status,'void').not(warranty_period_end is null)
--       .gte(warranty_period_end, floor).lte(warranty_period_end, ceil)
--     既存の idx_certificates_expiry_date は expiry_date 用で warranty_period_end を覆わない。
create index if not exists idx_certificates_warranty_end
  on certificates (tenant_id, warranty_period_end)
  where warranty_period_end is not null;

-- (2) next-touch: 誕生日が登録された顧客の抽出
--     customers.eq(tenant_id).not(birth_date is null)
--     birth_date への索引が無く、誕生日ありの顧客抽出が全件走査になりうる。
create index if not exists idx_customers_birth_date
  on customers (tenant_id, birth_date)
  where birth_date is not null;

-- (3) notification-logs 集計: 期間内の全種別を sent_at 降順で取得
--     notification_logs.eq(tenant_id).gte(sent_at, floor).order(sent_at desc)
--     既存 idx_notification_logs_tenant_type_created は (tenant_id, type, sent_at desc) で、
--     type を跨いだ (tenant_id, sent_at) 範囲+整列には先頭列不一致で使えない。
create index if not exists idx_notification_logs_tenant_sent
  on notification_logs (tenant_id, sent_at desc);
