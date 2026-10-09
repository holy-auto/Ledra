-- `assets` バケットに対する、ユーザーロールの直接読み書きを許す RLS ポリシーを外す。
--
-- 本番にだけ存在する（マイグレーションには一度も現れない）2 本:
--   - `assets_write_tenant`（ALL / authenticated / `name LIKE 'tenants/%'`）
--     → ログインしている誰でも**他テナントのロゴ・印影（tenants/<テナントID>/...）を上書き・削除・一覧**できる。
--   - `assets_tenant_rw`（ALL / authenticated / `tenants/<current_tenant_id()>/%`）
--     → 自テナントのメンバーなら、ロゴ管理の権限（logo:manage）やプランの判定を通さずに、Storage API で直接
--       自テナントのロゴ・印影を差し替えられる（LogoSealSection.tsx のサーバ側の判定を迂回できる）。
--       current_tenant_id() は所属が複数あると並び順が不定で、「自テナント」の範囲も定まらない。
-- アプリの `assets` への書き込み・削除はすべて service-role 経由で、ユーザーロールでは読み書きしない（全経路を確認）。
-- 公開 URL での読み取りは RLS を通らない。どちらを外してもアプリの動作は変わらない。
--
-- 2026-10-08 に本番の pg_policies で、`assets` を参照する storage.objects のポリシーがこの 2 本だけであることを確認。

drop policy if exists assets_write_tenant on storage.objects;
drop policy if exists assets_tenant_rw on storage.objects;

-- 名前の違い（ダッシュボードで作られた別名など）で drop が空振りしても気づけるよう、
-- `assets` を参照するポリシーが 1 本でも残っていれば失敗させる。
do $$
declare
  leftover text;
begin
  select string_agg(policyname, ', ') into leftover
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (coalesce(qual, '') ilike '%assets%' or coalesce(with_check, '') ilike '%assets%');
  if leftover is not null then
    raise exception 'assets を参照する storage.objects のポリシーが残っています: %', leftover;
  end if;
end $$;
