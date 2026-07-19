-- テナントごとの外部予約API キーを追加
-- 外部システム（Google Maps / LINE LIFF / Webフォーム）からの予約受付に使用する
-- 各テナントが独自のキーを持つことで、1つのキー漏洩が他テナントに影響しない

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS external_api_key text;

-- NULL を除いた上でユニーク制約を追加（未設定テナントは NULL のまま）
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_external_api_key
  ON tenants(external_api_key)
  WHERE external_api_key IS NOT NULL;

COMMENT ON COLUMN tenants.external_api_key
  IS '外部予約API用の認証キー。POST /api/external/booking の x-api-key ヘッダーで使用する。';
