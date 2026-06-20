-- RLS 書込ポリシー用のロール判定ヘルパー
--
-- 経緯: 当初この migration は売上目標 (sales_targets) を作成していたが、
-- main 側に別スキーマの sales_targets (20260612000002, year/month/各指標) が
-- 既に存在するため、テーブル/RPC/UI は main 実装に統一した。本 migration は
-- staff_members / staff_shifts / booths の RLS が参照するロール判定ヘルパー
-- public.tenant_caller_has_role のみを定義する（20260617000002/000003 が依存）。
--
-- 呼び出し元 (auth.uid()) が指定テナントで指定ロールのいずれかを持つか返す。
-- 「管理ロールのみ書込可」を RLS で表現するために使う（API ゲートをすり抜けて
-- Supabase クライアントから直接書き込まれるのを防ぐ）。security definer +
-- search_path='' は my_tenant_ids() と同じ流儀（tenant_memberships の RLS 再帰回避）。
-- ロールは大小無視で比較する（既存 my_tenant_role の lower(role::text) と整合）。
create or replace function public.tenant_caller_has_role(p_tenant uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships
    where tenant_id = p_tenant and user_id = auth.uid() and lower(role::text) = any(p_roles)
  );
$$;

grant execute on function public.tenant_caller_has_role(uuid, text[]) to authenticated;
