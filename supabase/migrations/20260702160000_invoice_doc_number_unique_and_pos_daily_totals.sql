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
-- (A) documents(tenant_id, doc_number) の一意制約（請求書番号の二重採番防止）
-- (B) POS 日計 (Z-report) の支払方法別 SUM/COUNT を返す集計 RPC
-- =============================================================

-- ── (A) 請求書番号の一意制約 ───────────────────────────────
--
-- generateInvoiceNumber は「最大番号 + 1」で採番するが、採番と INSERT の間に
-- TOCTOU があり、同時作成で同一 doc_number の請求書が二重に作られ得た。
-- アプリ側は 23505 リトライ（insertInvoiceWithRetry）で採番し直すが、最終防壁は
-- DB のユニーク索引で張る。tenant 跨ぎで番号は再利用されるため (tenant_id, doc_number)。
--
-- ponytail: 本番に既存の重複 doc_number が残っていると索引ビルドは失敗し、
--   INVALID な索引を残す。これは意図した forcing function で、先に重複を突合・解消
--   （番号振り直し）してから再実行すること。下の DO ブロックが事前検出して明示的に
--   失敗させ、再実行時は無効索引を DROP してから貼り直す。
--
-- 元は CREATE UNIQUE INDEX CONCURRENTLY のため（このファイルは 2026-09-04 に CONCURRENTLY を外した。冒頭の注を参照）、
-- 既存 uq_loaner_active_loan と同方針でこのファイルにまとめる。

-- (1) 既存の重複 doc_number を検出したら、無効索引を作る前に明示的に失敗させる。
do $$
begin
  if exists (
    select 1
    from public.documents
    where doc_number is not null
    group by tenant_id, doc_number
    having count(*) > 1
  ) then
    raise exception
      '重複する doc_number が存在します。先に重複を解消してから本 migration を再実行してください。';
  end if;
end $$;

-- (2) 失敗ビルドが残した無効索引を温存しないよう、貼り直す前に必ず落とす（未作成なら no-op）。
drop index if exists uq_documents_tenant_doc_number;

create unique index uq_documents_tenant_doc_number
  on public.documents (tenant_id, doc_number)
  where doc_number is not null;

-- ── (B) POS 日計の集計 RPC ─────────────────────────────────
--
-- daily-report ルートは対象日の completed 決済を最大 200 件だけ取得して JS で
-- 合算していたため、繁忙日に total_sales が過小計上されていた。行は転送せず
-- 支払方法別に SUM(amount)/COUNT を SQL 側で返す。
--
-- 設計: dashboard_unpaid_invoice_totals と同じく INVOKER（caller のロール = RLS 適用）。
--   tenant_id は引数必須。日付境界は呼び出し側が JST (+09:00) で確定して渡す。

create or replace function public.pos_daily_sales_totals(
  p_tenant_id uuid,
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns table (
  payment_method text,
  cnt bigint,
  total bigint
)
language sql
stable
as $$
  select
    payment_method,
    count(*)::bigint as cnt,
    coalesce(sum(amount), 0)::bigint as total
  from public.payments
  where tenant_id = p_tenant_id
    and status = 'completed'
    and paid_at >= p_day_start
    and paid_at <= p_day_end
  group by payment_method;
$$;

comment on function public.pos_daily_sales_totals(uuid, timestamptz, timestamptz) is
  'Aggregate completed POS payments by method for a tenant/day. Used by /api/admin/pos/daily-report to avoid capping the Z-report total at a row limit.';

grant execute on function public.pos_daily_sales_totals(uuid, timestamptz, timestamptz) to anon, authenticated, service_role;
