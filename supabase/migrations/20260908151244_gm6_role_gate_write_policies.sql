-- =============================================================================
-- G-M6 是正 (2026-09-08): 役割を見ない書き込みポリシーの是正（優先5表）。
--
-- 本番 pg_policies を実測して確認した現況（Supabase MCP、2026-09-08）:
--   - tenant_webhooks:            INSERT/UPDATE/DELETE すべて tenant_id のみ（役割不問）
--   - tenant_api_keys:            INSERT/UPDATE が tenant_id のみ（役割不問）。DELETE は
--                                   policy 自体が無く常に拒否（サービスロール経由のみ削除可）
--   - square_connections:         INSERT/DELETE は既に owner/admin 限定。UPDATE だけ tenant_id のみ
--   - tenant_integrations:        同上（UPDATE だけ tenant_id のみ）
--   - accounting_integrations:    同上（UPDATE だけ tenant_id のみ）
--
-- square_connections / tenant_integrations / accounting_integrations の
-- UPDATE は "SELECT/UPDATE = all members" とコメントされた意図的な設計だが、
-- square_connections は square_access_token / square_refresh_token を平文で
-- 持つ列であり、viewer 権限のメンバーでも PostgREST を直接叩けば書き換えられる
-- （アプリ層の `settings:edit` は viewer に付与していないので、UI 経由では
-- 到達しない。RLS を直接迂回する経路のみが対象）。
-- tenant_webhooks / tenant_api_keys は最初から「admin role のみ（アプリ層で
-- 制御済）」を前提に簡易ポリシーにしていたが、その前提を RLS 自身に持たせて
-- いなかった。
--
-- アプリ側の該当 API ルート（admin/integrations/{api-keys,webhooks},
-- admin/square/callback 等）は createTenantScopedAdmin（RLS bypass）+
-- requirePermission(caller, "settings:edit")（owner/admin のみ付与）を
-- 既に経由しているため、この是正で正規の書き込み経路の挙動は変わらない。
--
-- CREATE POLICY には IF NOT EXISTS が無いため、必ず DROP POLICY IF EXISTS で
-- 冪等にしてから作る（20260816000000_tenant_integrations.sql の教訓）。
-- =============================================================================

-- ─── tenant_webhooks ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_webhooks_insert_own ON tenant_webhooks;
DROP POLICY IF EXISTS tenant_webhooks_update_own ON tenant_webhooks;
DROP POLICY IF EXISTS tenant_webhooks_delete_own ON tenant_webhooks;

CREATE POLICY tenant_webhooks_insert_own ON tenant_webhooks
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY tenant_webhooks_update_own ON tenant_webhooks
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY tenant_webhooks_delete_own ON tenant_webhooks
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- ─── tenant_api_keys ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_api_keys_insert_own ON tenant_api_keys;
DROP POLICY IF EXISTS tenant_api_keys_update_own ON tenant_api_keys;

CREATE POLICY tenant_api_keys_insert_own ON tenant_api_keys
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY tenant_api_keys_update_own ON tenant_api_keys
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- ─── square_connections ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS square_connections_update_v2 ON square_connections;

CREATE POLICY square_connections_update_v2 ON square_connections
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- ─── tenant_integrations ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_integrations_update ON tenant_integrations;

CREATE POLICY tenant_integrations_update ON tenant_integrations
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- ─── accounting_integrations ─────────────────────────────────────────────────
DROP POLICY IF EXISTS accounting_integrations_update ON accounting_integrations;

CREATE POLICY accounting_integrations_update ON accounting_integrations
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );
