-- =============================================================
-- tenant_memberships.role のフェイルオープン対策
-- - default 'admin' は招待時に role を省略すると管理者権限が付与されてしまう
--   ため、最小権限の 'viewer' に変更する (アプリ側も明示的に role を指定済み:
--   signup は 'owner'、メンバー招待は role ?? 'viewer')
-- - 許可ロール以外の値が入らないよう CHECK 制約を追加する
-- =============================================================

alter table tenant_memberships
  alter column role set default 'viewer';

-- ponytail: NOT VALID — 既存行の検証をスキップする。想定外の値を持つレガシー行が
-- 残っていてもマイグレーションを失敗させないため。既存行の棚卸し後に
-- `alter table tenant_memberships validate constraint tenant_memberships_role_check;`
-- を別マイグレーションで実行してフル検証に引き上げる。
alter table tenant_memberships
  add constraint tenant_memberships_role_check
  check (role in ('super_admin', 'owner', 'admin', 'staff', 'viewer'))
  not valid;
