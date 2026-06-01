-- 供給パートナーを「代理店 (agents)」に統合する。
--
-- 背景: 当初 supply_partners は owner_user_id 直結 (純粋な卸も受け入れる想定) だったが、
--   プロダクト方針が「紹介もする代理店が商材も卸す」= パートナー≡代理店 に確定した。
--   そこで supply_partner の所有を agent_id 経由 (agent_users に属するユーザー) に切り替える。
--
-- 変更点:
--   1. my_supply_partner_ids() を agent_users 経由に再定義
--      (= 自分が属する agent に紐づく supply_partner を返す)。
--      supply_partners / _credentials / _products の RLS ポリシーは全て
--      `my_supply_partner_ids()` 経由なので、関数の差し替えだけで所有モデルが移行できる。
--   2. owner_user_id を後方互換のため残す (NULL 許容のまま)。新規プロビジョニングは
--      agent_id を必須にし、owner_user_id は記録用途。
--   3. agent_id の検索インデックスは既存 (idx_supply_partners_agent) を流用。
--
-- 冪等: CREATE OR REPLACE FUNCTION のみ。テーブル構造は変更しない。

-- ─── my_supply_partner_ids: agent 経由で解決 ────────────────────────────────────
-- ログイン中ユーザーが属する代理店 (agent_users.is_active) に紐づく supply_partner。
-- 後方互換: owner_user_id 直結のレコードも引き続き含める (移行期の安全弁)。
CREATE OR REPLACE FUNCTION my_supply_partner_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT sp.id
  FROM public.supply_partners sp
  WHERE
    -- 主経路: 自分が active メンバーである代理店に紐づく供給パートナー
    sp.agent_id IN (
      SELECT au.agent_id FROM public.agent_users au
      WHERE au.user_id = auth.uid() AND au.is_active = true
    )
    -- 後方互換: owner_user_id 直結 (旧モデルで作成済みのレコード)
    OR sp.owner_user_id = auth.uid();
$$;

COMMENT ON FUNCTION my_supply_partner_ids() IS
  '自分が属する代理店(agent_users)に紐づく supply_partner を返す。owner_user_id 直結の旧レコードも後方互換で含める。supply_partners 系 RLS の所有判定に使用。';
