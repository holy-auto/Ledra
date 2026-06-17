-- ================================================================
-- RLS ハードニング: anon / authenticated への意図しない露出を塞ぐ
--
-- 背景:
--   Supabase の default privileges により public スキーマの新規テーブルは
--   anon / authenticated ロールに GRANT される。RLS が無効、または
--   ポリシーが TO 句なし (= PUBLIC ロール) で USING(true) の場合、公開
--   anon キー + PostgREST 経由で全テナントの行が読み書きできてしまう。
--
--   以下 2 テーブルはアプリからは service-role (RLS バイパス) 経由でのみ
--   アクセスされており、anon / authenticated に開放する意図はなかった。
--   service-role は RLS をバイパスするため、ポリシーを service_role 限定
--   にしてもアプリ動作には影響しない。
-- ================================================================

-- ── 1) stripe_connect_transfers ──────────────────────────────
-- 既存ポリシー sct_service_all は TO 句が無く PUBLIC に適用されていたため、
-- anon / authenticated が送金記録 (Stripe account / 金額 / 手数料 / PaymentIntent /
-- tenant_id / agent_id) を全テナント分 CRUD できる状態だった。
-- 元のコメントの意図どおり service_role 限定に修正する。
DROP POLICY IF EXISTS sct_service_all ON stripe_connect_transfers;

CREATE POLICY sct_service_all ON stripe_connect_transfers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 2) tenant_billing_settings ───────────────────────────────
-- RLS が一度も有効化されておらず、default grants により anon / authenticated が
-- 任意テナントの請求タイミング設定を読み書きできる状態だった。
-- アプリは createTenantScopedAdmin (service-role) 経由でのみ参照・更新するため、
-- RLS を有効化し service_role 限定ポリシーのみを置く (他ロールは default deny)。
ALTER TABLE tenant_billing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tbs_service_all ON tenant_billing_settings;

CREATE POLICY tbs_service_all ON tenant_billing_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
