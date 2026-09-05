-- 供給パートナー発注の「全自動送信」(opt-in) の設定 — 壁3 隣接のため厳重にガードする。
--
-- 自動送信は既定 OFF。有効化には以下すべてが必要:
--   1. tenant_supply_auto_send_settings.enabled = true (店舗管理者が明示的に opt-in)
--   2. supply_partners.is_trusted = true (運営が承認した信頼パートナーのみ)
--   3. 1発注あたり上限 (max_order_jpy) と 月次上限 (monthly_cap_jpy) が正の値で設定済み
--   4. パートナーが API 連携済み (メールのみの相手は自動送信しない)
-- いずれか欠ければ自動送信せず draft のまま (人の承認待ち)。
--
-- 冪等・additive。

-- 1) 信頼パートナーフラグ (運営のみ設定。RLS 既存ポリシーで店舗は変更不可)。
-- 【後から内容だけ修正】supply_partners を作るのは 20260601000006（このファイルより後ろ）。
-- 無いときは飛ばす。空 DB 側の列は 20260601000006_supply_partners.sql の末尾で足す。
DO $mig$
BEGIN
  IF to_regclass('public.supply_partners') IS NOT NULL THEN
    ALTER TABLE public.supply_partners
      ADD COLUMN IF NOT EXISTS is_trusted boolean NOT NULL DEFAULT false;

    COMMENT ON COLUMN public.supply_partners.is_trusted IS
      '運営が承認した信頼パートナー。全自動送信(auto-send)の対象になり得る。既定 false。';
  END IF;
END
$mig$;

-- 2) テナント別の自動送信設定。
CREATE TABLE IF NOT EXISTS tenant_supply_auto_send_settings (
  tenant_id        uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled          boolean NOT NULL DEFAULT false,
  -- 上限 (円)。NULL / 0 以下なら自動送信しない (安全側)。
  max_order_jpy    integer,
  monthly_cap_jpy  integer,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE tenant_supply_auto_send_settings ENABLE ROW LEVEL SECURITY;

-- 店舗 (テナントメンバー) が自店の設定を読み書きできる。
DROP POLICY IF EXISTS "tsass_select" ON tenant_supply_auto_send_settings;
CREATE POLICY "tsass_select" ON tenant_supply_auto_send_settings
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "tsass_insert" ON tenant_supply_auto_send_settings;
CREATE POLICY "tsass_insert" ON tenant_supply_auto_send_settings
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
DROP POLICY IF EXISTS "tsass_update" ON tenant_supply_auto_send_settings;
CREATE POLICY "tsass_update" ON tenant_supply_auto_send_settings
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

DROP TRIGGER IF EXISTS trg_tsass_updated_at ON tenant_supply_auto_send_settings;
CREATE TRIGGER trg_tsass_updated_at
  BEFORE UPDATE ON tenant_supply_auto_send_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE tenant_supply_auto_send_settings IS
  '供給パートナー発注の全自動送信(opt-in)設定。既定 OFF。enabled + 信頼パートナー + 上限設定 + API連携 が揃って初めて自動送信される。';
