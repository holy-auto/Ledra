-- ============================================================
-- G-M3 / G-M4 / G-M5 / G-M7 是正: 過度に緩い RLS policy / RLS 未有効化を修正
--
-- 監査 2026-09-08 (Medium):
--
--   G-M3 storage.objects の market_storage_insert/delete が `auth.uid() IS NOT
--   NULL` のみで、テナントの区別が無かった。認証済みなら誰でも他テナントの
--   中古車画像を削除・任意ファイルを public CDN URL で配信できた
--   （src/app/api/admin/market-vehicles/images/route.ts は利用者 JWT の
--   クライアントでアップロードしており、このポリシーが実効の防壁）。
--
--   G-M4 saved_news の INSERT policy が `WITH CHECK (true)` かつロール指定
--   無しで、既定の PostgREST 権限（anon に INSERT 権限あり）と組み合わさり、
--   anon キーで全テナント管理画面のニュース欄へ任意リンクを注入できた。
--   service_role は RLS を BYPASSRLS で無視するため、このポリシー自体が不要。
--
--   G-M5 vehicle_size_master（全テナント共有マスタ）の書き込みが「どこかの
--   テナントの owner/admin」なら誰でも可能だった（自テナント作成は無料な
--   ので実質誰でも）。料金表に使う共有マスタを他社が改変・全削除できた。
--
--   G-M7 insurer_email_verifications は RLS が一度も有効化されていなかった
--   （256 表中唯一）。本番は本番固有の自動有効化トリガで有効な可能性が高いが、
--   プレビュー/DR復元/新規環境では無効のまま。policy は追加しない
--   （このテーブルへは createServiceRoleAdmin 経由のみでアクセスする設計）。
-- ============================================================

-- ── G-M3: market ストレージの書込みをテナント本人に限定 ──
-- パスは `market/<tenant_id>/<vehicle_id>/<file>` （src/app/api/admin/market-vehicles
-- /images/route.ts:115）。storage.foldername() はファイル名込みで分割するため
-- [1]='market', [2]=tenant_id。
drop policy if exists market_storage_insert on storage.objects;
create policy market_storage_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'market'
    and (storage.foldername(name))[2] in (select public.my_tenant_ids()::text)
  );

drop policy if exists market_storage_delete on storage.objects;
create policy market_storage_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'market'
    and (storage.foldername(name))[2] in (select public.my_tenant_ids()::text)
  );

-- ── G-M4: saved_news への anon 書込みを塞ぐ（service_role は BYPASSRLS） ──
drop policy if exists "Service role can insert news" on saved_news;

-- ── G-M5: vehicle_size_master の書込みをプラットフォーム管理者限定に ──
drop policy if exists vehicle_size_master_admin_all on vehicle_size_master;
create policy vehicle_size_master_admin_all on vehicle_size_master
  for all
  using (public.is_super_admin_user())
  with check (public.is_super_admin_user());

-- ── G-M7: insurer_email_verifications の RLS を有効化（policy は追加しない = service_role 専用） ──
alter table insurer_email_verifications enable row level security;
