-- Fix: get_my_user_contexts() が SET search_path = '' になった後も
-- 非修飾テーブル名を使っていたため RPC 呼び出しが失敗していた。
-- public. プレフィックスを付けて再定義する。

CREATE OR REPLACE FUNCTION get_my_user_contexts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  v_au_agent_id  UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 施工店メンバーシップ確認
  SELECT tenant_id
  INTO v_tenant_id
  FROM public.tenant_memberships
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    v_has_shop := TRUE;
  END IF;

  -- 代理店確認: まず agent_users から agent_id と role を取得
  SELECT agent_id, role
  INTO v_au_agent_id, v_agent_role
  FROM public.agent_users
  WHERE user_id = v_user_id
    AND is_active = true
  LIMIT 1;

  -- 次に agents から詳細を取得
  IF v_au_agent_id IS NOT NULL THEN
    SELECT id, name, status
    INTO v_agent_id, v_agent_name, v_agent_status
    FROM public.agents
    WHERE id = v_au_agent_id
    LIMIT 1;
  END IF;

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
