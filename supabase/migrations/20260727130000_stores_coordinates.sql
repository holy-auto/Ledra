-- 店舗の位置座標 (緯度・経度)。
-- 写真GPSと店舗位置の整合性チェック (Phase 2) の基準座標に使う。
-- 追加のみ・NULL 許容・デフォルト無しでテーブル書き換えを起こさない安全な変更。
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

COMMENT ON COLUMN stores.latitude IS '店舗の緯度 (WGS84・十進度)。写真GPS整合チェックの基準。任意入力。';
COMMENT ON COLUMN stores.longitude IS '店舗の経度 (WGS84・十進度)。写真GPS整合チェックの基準。任意入力。';
