-- =============================================================
-- ダッシュボード/リマインド集計クエリ向けの支援索引 (CONCURRENTLY)
--
-- 「次の接触」(/admin/next-touch) と「通知配信状況」(/admin/notification-logs) の
-- 集計は、テナント横断の範囲/存在フィルタで既存テーブルを走査する。以下の列には
-- 支援索引が無く seq scan になりうるため、書込ロックを避ける CONCURRENTLY で
-- 部分索引を張る。
--
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため、既存テーブル
-- (通常運用で書き込まれる) への索引追加は本ファイルに集約する。
-- =============================================================

-- (1) next-touch: 保証満了が近い証明書の抽出
--     certificates.eq(tenant_id).neq(status,'void').not(warranty_period_end is null)
--       .gte(warranty_period_end, floor).lte(warranty_period_end, ceil)
--     既存の idx_certificates_expiry_date は expiry_date 用で warranty_period_end を覆わない。
create index concurrently if not exists idx_certificates_warranty_end
  on certificates (tenant_id, warranty_period_end)
  where warranty_period_end is not null;

-- (2) next-touch: 誕生日が登録された顧客の抽出
--     customers.eq(tenant_id).not(birth_date is null)
--     birth_date への索引が無く、誕生日ありの顧客抽出が全件走査になりうる。
create index concurrently if not exists idx_customers_birth_date
  on customers (tenant_id, birth_date)
  where birth_date is not null;

-- (3) notification-logs 集計: 期間内の全種別を sent_at 降順で取得
--     notification_logs.eq(tenant_id).gte(sent_at, floor).order(sent_at desc)
--     既存 idx_notification_logs_tenant_type_created は (tenant_id, type, sent_at desc) で、
--     type を跨いだ (tenant_id, sent_at) 範囲+整列には先頭列不一致で使えない。
create index concurrently if not exists idx_notification_logs_tenant_sent
  on notification_logs (tenant_id, sent_at desc);
