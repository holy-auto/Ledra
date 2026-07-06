-- サポート FAQ テーブル
-- /api/admin/faq (GET/POST/PUT/DELETE) が参照していたがテーブル定義が
-- リポジトリに存在せず、GET は空フォールバック・書き込みは常に失敗していた。
create table if not exists support_faq (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table support_faq enable row level security;

-- 全認証ユーザーが閲覧可 (サポートページの FAQ 表示)
create policy "support_faq_select" on support_faq
  for select to authenticated using (true);

-- 書き込みは運営 (super admin) のみ
create policy "support_faq_write" on support_faq
  for all using (is_super_admin_user()) with check (is_super_admin_user());
