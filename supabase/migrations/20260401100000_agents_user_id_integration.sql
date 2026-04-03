-- =============================================================================
-- Migration: マルチロール対応（施工店・代理店アカウント統合）
-- 目的: 単一の auth.users ユーザーが施工店と代理店の両ロールを持てるようにする
--
-- 設計:
--   - agents テーブルは agent_users(agent_id, user_id) で auth.users と紐付け済み
--   - agents テーブルへの user_id 追加は不要
--   - agent_applications に user_id を追加（申請者の auth.users.id を記録）
--   - get_my_user_contexts() RPC を追加（施工店/代理店の両ロール確認）
--   - get_my_agent_status() は既存実装（agent_users ベース）を維持
-- =============================================================================

-- 1. agent_applications に user_id カラムを追加
--    （申請時にログイン済みユーザーの場合、申請者を紐付ける）
ALTER TABLE agent_applications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_applications_user_id
  ON agent_applications(user_id);

-- 2. 既存データのバックフィル:
--    agent_applications.email と auth.users.email を突き合わせて user_id を設定
UPDATE agent_applications aa
SET user_id = u.id
FROM auth.users u
WHERE aa.email = u.email
  AND aa.user_id IS NULL;

-- 3. get_my_user_contexts() RPC を追加
--    ログイン中ユーザーが施工店・代理店のどちらに属するかを返す
CREATE OR REPLACE FUNCTION get_my_user_contexts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_has_shop     BOOLEAN := FALSE;
  v_has_agent    BOOLEAN := FALSE;
  v_tenant_id    UUID;
  v_agent_id     UUID;
  v_agent_name   TEXT;
  v_agent_status TEXT;
  v_agent_role   TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 施工店メンバーシップ確認
  SELECT tm.tenant_id
  INTO v_tenant_id
  FROM tenant_memberships tm
  WHERE tm.user_id = v_user_id
  LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    v_has_shop := TRUE;
  END IF;

  -- 代理店確認（agent_users 経由）
  SELECT a.id, a.name, a.status, au.role
  INTO v_agent_id, v_agent_name, v_agent_status, v_agent_role
  FROM agent_users au
  JOIN agents a ON a.id = au.agent_id
  WHERE au.user_id = v_user_id
    AND au.is_active = true
  LIMIT 1;

  IF v_agent_id IS NOT NULL THEN
    v_has_agent := TRUE;
  END IF;

  RETURN json_build_object(
    'has_shop',     v_has_shop,
    'has_agent',    v_has_agent,
    'tenant_id',    v_tenant_id,
    'agent_id',     v_agent_id,
    'agent_name',   v_agent_name,
    'agent_status', v_agent_status,
    'agent_role',   v_agent_role
  );
END;
$$;

-- 4. agent_applications の RLS 更新
--    申請者自身が自分の申請を参照できるようにする
ALTER TABLE agent_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_applications_select_own" ON agent_applications;
CREATE POLICY "agent_applications_select_own" ON agent_applications
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
  );

-- ※ INSERT は API 経由（service_role）のみ許可（anon からの直接 INSERT は禁止）
DROP POLICY IF EXISTS "agent_applications_insert_anon" ON agent_applications;
