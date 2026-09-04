-- 本番適用済み（2026-09-04、記録バージョン 20260904123252）。
-- ファイル名は記録バージョンに合わせてある（docs/operations/migrations.md の
-- 「本番へ適用したら、ファイル名と記録されたバージョンが一致しているか確認する」）。
-- 当初 20260904000000 で書いたが、それでは既に適用済みの 20260904060245 より前になり
-- out-of-order になっていた。
--
-- 逸脱の申告: 手順書は「ADD CONSTRAINT ... CHECK は NOT VALID を付け、VALIDATE を
-- 別ファイルにする」としているが、このファイルは VALIDATE を同じファイルに置いている。
-- 対象は本番5行でロック時間が問題にならず、既にこの内容のまま1トランザクションで
-- 適用済みのため、あとから分割すると「本番で走っていないファイル」が生まれる。
-- 次に CHECK 制約を足すときは分割すること（先例: 20260425000000/20260425000001）。

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
-- 注意: このポリシーはリポジトリのどのマイグレーションでも作られていない（本番にだけ在る）。
-- したがって空DBからの再生では DROP は何にもマッチせず、この修正は再生では検証されない。
-- 本番とリポジトリの乖離そのものは別途 OPEN_QUESTIONS で追う。
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
-- NOT VALID で足してから VALIDATE する。ADD CONSTRAINT ... CHECK を一発で書くと
-- ACCESS EXCLUSIVE ロックのまま全行スキャンする（scripts/lint-migrations.js の
-- add-check-without-not-valid）。本番5件でも規約は規約なので従う。
-- DROP IF EXISTS を先に置いて再実行可能にする（20260325800000_standard_templates.sql と同じ形）。
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_shared_is_platform_owned;
ALTER TABLE templates
  ADD CONSTRAINT templates_shared_is_platform_owned
  CHECK (scope <> 'shared' OR tenant_id IS NULL) NOT VALID;
ALTER TABLE templates VALIDATE CONSTRAINT templates_shared_is_platform_owned;

-- templates_write_owner_admin は `(scope='shared' AND false)` で共有作成を禁じる意図だったが、
-- PERMISSIVE の OR 評価で templates_insert_v2（scope を見ない）に打ち消されていて、
-- 今日まで一度も効いていない。意図は上の CHECK 制約が担うので、
-- 読む人を誤らせるだけのこのポリシーは落とす。
-- （落としても実効権限は変わらない。v2 の方が緩く、常にそちらが通っていた。）
-- 同上。templates_write_owner_admin / templates_insert_v2 / templates_update_v2 は
-- いずれも本番にだけ在り、リポジトリには無い。上の CHECK 制約が
-- 「tenant_id IN (my_tenant_ids()) を要求するポリシー」に依存しているのは本番の話であって、
-- 空DBでは templates に書き込みポリシーが1本も無い（=誰も書けない）状態になっている。
DROP POLICY IF EXISTS templates_write_owner_admin ON templates;
