-- =============================================================
-- 役割を見ない古い RLS ポリシーを削除する
--
-- 背景:
--   20260323020000_rls_role_constraints.sql が「SELECT=全ロール / INSERT・UPDATE=
--   owner,admin,staff / DELETE=owner,admin」という役割別の制約を *_v2 ポリシーとして
--   追加した。しかし**それ以前からある役割を見ないポリシーを削除しなかった**。
--
--   PostgreSQL は同一コマンドに対する PERMISSIVE ポリシーを **OR** で評価するため、
--   古い緩い方が常に勝ち、_v2 の絞り込みは一度も効いていなかった。
--   結果として viewer（閲覧専用ロール）が証明書・車両・整備履歴・NFCタグ・
--   テンプレートを作成/更新/削除できる状態だった。
--
--   `FOR ALL` のポリシーは SELECT/INSERT/UPDATE/DELETE すべてに掛かるため、
--   コマンド別に数えると見落とす（実際に最初の調査で取りこぼした）。
--
-- 安全性:
--   削除対象のテーブルはいずれも SELECT/INSERT/UPDATE/DELETE それぞれに _v2 ポリシーが
--   既に存在するため、`FOR ALL` を落としても読み取りは失われない。
--   service_role は RLS を迂回するので、service-role 経由の書き込み経路は影響を受けない。
--   本番のロール構成は owner 23 / staff 1 / super_admin 1（viewer・admin は 0）で、
--   `my_tenant_role()` は super_admin を owner に写像するため、
--   この変更で書き込みを失う既存ユーザーはいない。
--
-- tenants の UPDATE は意図的にこのマイグレーションの対象外:
--   `tenants_update_v2`（owner のみ）と `tenants_update_owner_admin`（owner/admin/
--   super_admin）が併存し、実効は後者。20260323020000 のヘッダは「tenants UPDATE:
--   owner only」と書いているが、アプリ側は `settings:edit`（admin 以上）を要求しており、
--   どちらを正とするかは事業判断。docs/context/OPEN_QUESTIONS.md 参照。
-- =============================================================

-- -------------------------------------------------------
-- 1) 役割を見ないポリシーが役割別ポリシーを打ち消していたもの
-- -------------------------------------------------------

-- certificates: is_member_of_tenant() = テナントメンバー全員
DROP POLICY IF EXISTS cert_insert_member ON certificates;
DROP POLICY IF EXISTS cert_update_member ON certificates;

-- templates: tenant_id の所属だけを見て役割を見ない
-- (templates_write_owner_admin が scope='shared' の作成を禁じている意図も無効化していた)
DROP POLICY IF EXISTS tpl_insert ON templates;
DROP POLICY IF EXISTS tpl_update ON templates;
DROP POLICY IF EXISTS tpl_delete ON templates;

-- vehicles / vehicle_histories / nfc_tags: FOR ALL のテナントメンバー全員ポリシー
DROP POLICY IF EXISTS vehicles_tenant_access ON vehicles;
DROP POLICY IF EXISTS vehicle_histories_tenant_access ON vehicle_histories;
DROP POLICY IF EXISTS vh_update ON vehicle_histories;
DROP POLICY IF EXISTS nfc_tags_tenant_access ON nfc_tags;

-- job_orders: my_dealer_id() は dealer_users を引くが本番は 0 行で、
-- このポリシーは常に false（既に死んでいる）。役割判定も無いので削除する。
DROP POLICY IF EXISTS insert_jobs ON job_orders;
DROP POLICY IF EXISTS update_jobs ON job_orders;

-- -------------------------------------------------------
-- 2) 行の所有者を見ない権限判定（越境）
-- -------------------------------------------------------
-- is_insurer_admin() は「どこかの保険会社の admin か」しか見ておらず、
-- 対象行の insurer_id で絞っていない。保険会社Aの管理者が保険会社Bの
-- ユーザーを作成・変更・削除できた。
-- 自社スコープの iu_insert / iu_update / iu_delete を残す。
DROP POLICY IF EXISTS insurer_users_insert_admin ON insurer_users;
DROP POLICY IF EXISTS insurer_users_update_admin ON insurer_users;
DROP POLICY IF EXISTS insurer_users_delete_admin ON insurer_users;

-- -------------------------------------------------------
-- 3) 監査ログの偽装
-- -------------------------------------------------------
-- insurer_access_logs_insert_v2 は「有効な保険会社ユーザーであること」しか見ず、
-- 書き込む行の insurer_id / insurer_user_id を検証しない。他人・他社名義の
-- アクセスログを作成できた。自分名義に限定する logs_insert_self_only を残す。
DROP POLICY IF EXISTS insurer_access_logs_insert_v2 ON insurer_access_logs;
