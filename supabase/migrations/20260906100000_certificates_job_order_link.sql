-- 【2026-09-04 / 09-05 / 09-06 ×2 と4回改名】元のファイル名は 20260901000001 だった。base（main）の最新と本番の適用済み最新は**別の値**で、どちらより後にする必要がある。
-- 2026-09-06 時点で base = 20260906000003（このファイル自身の旧版。#1020 マージ済み）、
-- 本番 = 20260906094735（#966 が apply_migration で本番へ直接当てた版。main には無い）。
-- 20260906100000 台はその両方より後。
-- **lint の migration-version-before-base-head は base としか比べない。**
-- 本番へ直接適用された版は見えないので、改名時は台帳も引くこと（M-045）。
-- 古いバージョンの未適用ファイルがあると
-- `supabase db push` が out-of-order で停止し、以降のマイグレーションが本番へ
-- 一切届かなくなる（.github/workflows/db-migrate.yml の不変条件2）。
-- 本番の schema_migrations に 20260901000001 が無いことを名指しで確認したうえで改名した
-- （適用済みを改名すると不変条件1に抵触する）。
-- `npm run lint:migrations` の migration-version-before-base-head が静的に見ている。
-- 外注施工の記録を「発注」に紐付ける: certificates.job_order_id
--
-- 背景:
--   テナント間の外注（job_orders: 元請け A → 受注 B）で施工した記録が、
--   受発注のどちらの画面にも出てこなかった。/admin/orders/[id] は状態遷移・
--   検収サイン・請求・チャット・評価だけを扱い、成果物（施工証明）への参照が
--   一切無い。結果として
--     - 元請けは「発注した作業の証明書」を受注画面から辿れない
--     - 外注先は、元請け名義で発行された証明書を一切見られない（自分が施工した
--       記録が Ledra 上のどこにも残らない）
--   という2つの穴が同時に空いていた。
--
-- 設計:
--   documents / chat_messages / order_reviews / reservation_holds と同じ
--   `job_order_id` 規約に揃える。証明書がどちらのテナント名義で発行されても
--   （元請け名義でも外注先名義でも）同じ1本の発注に紐付くので、双方が
--   /admin/orders/[id] の同じ画面で成果物を見られる。
--
--   施工者テナントは job_orders.to_tenant_id から引ける（別カラムを持たない）。
--   ponytail: 発注管理（job_orders）を通さない外注（電話で頼んだ等）はこの
--   紐付けの対象外。そこまで扱う必要が出たら certificates.performed_by_tenant_id
--   を足して発注非依存にするのが上位互換の道。
--
-- PII 境界（重要）:
--   **RLS は意図的に変更しない。** 相手方テナントに certificates 行そのものを
--   読ませると、customer_name / content_free_text / customer_phone_last4 など
--   発注元の顧客 PII まで渡ってしまう。相手方への開示は
--   /api/admin/orders/[id] が public_id と非 PII 列だけを返し、詳細は既に
--   PII を落としてある公開ページ /c/[public_id]（getPublicCertificateData が
--   customer_name・content_free_text を undefined 化）へ送る形にする。

alter table certificates
  add column if not exists job_order_id uuid references job_orders(id) on delete set null;

comment on column certificates.job_order_id is
  'テナント間の外注（job_orders）で施工した場合の発注 ID。受発注の双方が同じ発注画面から成果物を辿るための紐付け。施工者テナントは job_orders.to_tenant_id 側。';

-- 索引は CONCURRENTLY のため別ファイル (20260906100001)。

-- ─── テナント整合トリガー ────────────────────────────────────────────────────
-- job_order_id は id のみで参照するため、Supabase 直叩きで無関係な発注の UUID を
-- 指せてしまう。craftsman_staff_id と同じく BEFORE トリガーで「その発注の当事者
-- （発注元 or 受注先）が証明書のテナントか」を強制する（tenant_id 変更時も発火）。
create or replace function public.certificates_check_job_order_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_order_id is not null and not exists (
    select 1 from public.job_orders
    where id = new.job_order_id
      and (from_tenant_id = new.tenant_id or to_tenant_id = new.tenant_id)
  ) then
    raise exception 'job_order % does not involve tenant %', new.job_order_id, new.tenant_id;
  end if;
  return new;
end;
$$;

-- トリガー関数は呼び出しロールの EXECUTE を必要としない（20260616000004 と同方針）。
revoke execute on function public.certificates_check_job_order_tenant() from public, anon, authenticated;
grant  execute on function public.certificates_check_job_order_tenant() to service_role;

drop trigger if exists trg_certificates_check_job_order_tenant on certificates;
create trigger trg_certificates_check_job_order_tenant
  before insert or update of job_order_id, tenant_id on certificates
  for each row execute function public.certificates_check_job_order_tenant();
