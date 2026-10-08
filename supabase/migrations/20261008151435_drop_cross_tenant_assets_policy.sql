-- `assets` バケットの、テナントをまたいで読み書きできる RLS ポリシーを外す。
--
-- 本番にだけ存在するポリシー `assets_write_tenant`（ALL / authenticated / `name LIKE 'tenants/%'`）は、
-- ログインしている誰でも**他テナントのロゴ・印影（tenants/<他テナントID>/...）を上書き・削除・一覧**できる。
-- 同じ範囲を自テナントに絞った `assets_tenant_rw`（`tenants/<current_tenant_id()>/%`）が既にあり、
-- アプリの書き込みはすべて service-role 経由（LogoSealSection.tsx の注記どおり、ユーザーロールでは書かない）なので、
-- このポリシーを外してもアプリの動作は変わらない。公開 URL での読み取りは RLS を通らないので影響しない。
--
-- 2026-10-08 に本番の pg_policies で存在と条件を確認。マイグレーションには一度も現れない（本番だけのドリフト）。

drop policy if exists assets_write_tenant on storage.objects;
