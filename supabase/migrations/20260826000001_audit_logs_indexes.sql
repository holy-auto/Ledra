-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- **CONCURRENTLY を外した。** Supabase のブランチ機能はマイグレーションの複数文を
-- パイプラインで送るため、2文目以降の CONCURRENTLY が
-- `CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)`
-- で落ちる。CONCURRENTLY が要るのは「書き込みが走っている本番のテーブルをロックしない」
-- ためで、このファイルは本番では再適用されず、空 DB では対象テーブルが空なので
-- ロックの問題は起きない。
-- 新しいファイルで CONCURRENTLY を使うときは **1ファイル1文** にすること
-- （`npm run lint:migrations` の concurrently-in-multi-statement-file が見ている）。
-- ============================================================
-- audit_logs の索引。元は CONCURRENTLY のため 20260823000000（列と制約の調整）とは
-- 別ファイルに分けていた（2026-09-04 に CONCURRENTLY を外した。冒頭の注を参照）。
-- ============================================================

create index if not exists idx_audit_logs_tenant_performed
  on public.audit_logs (tenant_id, performed_at desc);

-- 顧客ポータルの閲覧履歴が target_public_id で引くため
create index if not exists idx_audit_logs_target_public_id
  on public.audit_logs (target_public_id)
  where target_public_id is not null;
