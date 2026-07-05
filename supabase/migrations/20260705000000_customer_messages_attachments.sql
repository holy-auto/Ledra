-- =============================================================
-- LINE 受信メディア (画像) の受信箱表示
--
--   顧客が LINE で送った画像を content API から取得して Storage に保存し、
--   受信箱・顧客メッセージタブで表示できるようにする。
--   1. customer_messages.attachment_path / attachment_content_type
--      保存先 (line-media バケット内のパス) と MIME タイプ。
--   2. 非公開バケット line-media
--      アクセスは API (service role) が発行する署名付き URL 経由のみ。
--      storage.objects へのクライアント直接アクセスは想定しないため
--      追加の storage RLS ポリシーは張らない。
-- =============================================================

alter table customer_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_content_type text;

comment on column customer_messages.attachment_path is
  'line-media バケット内の保存パス。NULL=添付なし。表示時は署名付きURLを都度発行する。';
comment on column customer_messages.attachment_content_type is
  '添付の MIME タイプ (image/jpeg 等)。attachment_path とセットで設定される。';

insert into storage.buckets (id, name, public)
values ('line-media', 'line-media', false)
on conflict (id) do nothing;
