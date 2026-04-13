-- Fix: customer_inquiries テーブルとRLSポリシーを正しく作成
-- 旧マイグレーションが "tenant_members"（存在しないテーブル）を参照して失敗したため再作成

-- 既存ポリシーの削除（テーブルが存在する場合のみ）
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'customer_inquiries') then
    drop policy if exists "tenant_members_select" on customer_inquiries;
    drop policy if exists "tenant_members_update" on customer_inquiries;
    drop policy if exists "service_role_all" on customer_inquiries;
  end if;
end $$;

-- テーブル作成（既に存在する場合はスキップ）
create table if not exists customer_inquiries (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  customer_name       text,
  phone_last4_hash    text not null,
  subject             text not null default 'お問い合わせ',
  message             text not null,
  status              text not null default 'new' check (status in ('new', 'read', 'replied')),
  admin_reply         text,
  replied_at          timestamptz,
  replied_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists customer_inquiries_tenant_idx
  on customer_inquiries(tenant_id, created_at desc);

create index if not exists customer_inquiries_hash_idx
  on customer_inquiries(tenant_id, phone_last4_hash, created_at desc);

alter table customer_inquiries enable row level security;

-- 管理者（tenant_memberships 経由）のみ参照・更新可能
create policy "tenant_members_select"
  on customer_inquiries for select
  using (
    exists (
      select 1 from tenant_memberships tm
      where tm.tenant_id = customer_inquiries.tenant_id
        and tm.user_id = auth.uid()
    )
  );

create policy "tenant_members_update"
  on customer_inquiries for update
  using (
    exists (
      select 1 from tenant_memberships tm
      where tm.tenant_id = customer_inquiries.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- service_role（API）はすべて許可
create policy "service_role_all"
  on customer_inquiries for all
  using (auth.role() = 'service_role');
