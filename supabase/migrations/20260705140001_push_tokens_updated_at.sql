-- push_tokens.updated_at 追加
-- /api/mobile/push/register の upsert が updated_at を書き込むが、
-- 20260325000001_mobile_support.sql の定義に列が無く INSERT が失敗するため追補。
alter table push_tokens add column if not exists updated_at timestamptz default now();
