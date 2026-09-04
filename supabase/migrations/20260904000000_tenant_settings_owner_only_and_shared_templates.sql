-- 判断待ちだった2件を代表判断（2026-09-04）に基づいて確定させる。
--
-- 1) tenants の UPDATE は owner のみ
-- 2) 共有テンプレート（全テナント横断で読める雛形）はプラットフォーム運営のみが作る
--
-- どちらも「PERMISSIVE ポリシーは OR で評価される」ため、緩い方が実効になっていた。

-- -------------------------------------------------------
-- 1) tenants UPDATE : owner only
-- -------------------------------------------------------
-- 2本の PERMISSIVE ポリシーがあり、実効は緩い方（owner/admin/super_admin）だった。
--   tenants_update_v2          : owner のみ
--   tenants_update_owner_admin : owner / admin / super_admin
-- 20260323020000_rls_role_constraints.sql のヘッダは「tenants UPDATE : owner only」と
-- 書いてあるのに、あとから足した緩い方がそれを打ち消していた。
--
-- 代表判断: テナント設定（社名・ロゴ・保証除外文言・請求タイミング・銀行口座）は
-- owner のみ。緩い方を落とす。
--
-- 注意: これだけでは admin の保存が「0行更新で成功扱い」になる。
-- アプリ側（updateTenantSettingsAction / admin/settings/defaults PUT）も
-- 同じコミットで owner 要求に直し、0行更新をエラーとして返すようにしてある。
DROP POLICY IF EXISTS tenants_update_owner_admin ON tenants;

-- -------------------------------------------------------
-- 2) 共有テンプレートはプラットフォーム運営のみ
-- -------------------------------------------------------
-- 実態を先に書いておく。本番の templates 5件（コーティング/PPF/整備/鈑金塗装/用品取付の
-- 各スタンダード）は **tenant_id IS NULL・scope='tenant'** で、tpl_select の
-- `tenant_id IS NULL` 経由で全テナントが読んでいる。
-- つまり「プラットフォームが用意する共有雛形」は既に存在するが、scope 列は
-- それを表していない。scope='shared' の行は本番に 0 件。
--
-- 穴: テナントの owner/admin/staff が scope='shared' の行を自分の tenant_id で
-- 作れてしまう。templates_select の `scope='shared' OR ...` により、その行は
-- **全テナントから読める**。アプリに書き込み経路は無い（admin/templates は GET のみ）が、
-- PostgREST は公開エンドポイントなので実在の穴。
--
-- INSERT だけ塞いでも足りない。templates_update_v2 は WITH CHECK を持たず、
-- USING も scope を見ないため、既存行を scope='shared' に**書き換えられる**。
-- 経路が2本ある（MISTAKE_LEDGER 型 C）。
--
-- そこでポリシーを3本書き換えるのではなく、テーブル制約を1本置く。
-- 「shared であることは tenant_id が NULL であること」= プラットフォーム所有。
-- テナント向けポリシーはすべて `tenant_id IN (my_tenant_ids())` を要求するので、
-- NULL はそこを通れない。INSERT も UPDATE も、この1本で塞がる。
-- service_role は RLS を迂回するので、運営側は従来どおり作成できる。
ALTER TABLE templates
  ADD CONSTRAINT templates_shared_is_platform_owned
  CHECK (scope <> 'shared' OR tenant_id IS NULL);

-- templates_write_owner_admin は `(scope='shared' AND false)` で共有作成を禁じる意図だったが、
-- PERMISSIVE の OR 評価で templates_insert_v2（scope を見ない）に打ち消されていて、
-- 今日まで一度も効いていない。意図は上の CHECK 制約が担うので、
-- 読む人を誤らせるだけのこのポリシーは落とす。
-- （落としても実効権限は変わらない。v2 の方が緩く、常にそちらが通っていた。）
DROP POLICY IF EXISTS templates_write_owner_admin ON templates;
