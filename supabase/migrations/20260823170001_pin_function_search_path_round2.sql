-- ============================================================
-- search_path が固定されていない関数を固定する（advisor: function_search_path_mutable）
--
-- 6 本とも SECURITY DEFINER ではない（呼び出し元の権限で動く）ため、
-- 既に対処済みの SECURITY DEFINER 群ほどの危険は無い。ただし search_path を
-- 呼び出し側に握られると、同名のオブジェクトを先に見せることで意図しない
-- テーブル/関数を参照させられる。既存の方針（20260616000008_pin_function_search_path、
-- 20260604000000_fix_security_definer_search_path 系）に揃えて固定する。
--
-- 本体を書き換えずに済むよう `public, pg_temp` を明示する（`''` にすると
-- 関数内の非修飾参照が全部壊れるため、そこまではやらない）。
-- 関数が無い環境でも止まらないよう、存在するものだけに当てる。
-- ============================================================

do $$
declare
  r record;
  targets text[] := array[
    'touch_vehicle_report_tiers_updated_at',
    'touch_vehicle_report_revenue_shares_updated_at',
    'pos_daily_sales_totals',
    'estimate_vehicle_size',
    'calc_size_class_from_volume',
    'check_reservation_overlap'
  ];
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(targets)
      and p.proconfig is null  -- 既に固定済みのものは触らない
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;
