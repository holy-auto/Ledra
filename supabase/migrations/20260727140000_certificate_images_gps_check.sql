-- 写真GPSと店舗位置の整合性チェックの「結果のみ」を保存する列。
-- プライバシー方針: 生のGPS座標は保存しない。アップロード時にメモリ内で照合し、
-- 判定（verdict）と距離帯（bucket）だけを残す（座標は破棄）。
-- 追加のみ・NULL 許容・デフォルト無しで安全。
ALTER TABLE certificate_images
  ADD COLUMN IF NOT EXISTS gps_check_verdict text,
  ADD COLUMN IF NOT EXISTS gps_distance_bucket text;

COMMENT ON COLUMN certificate_images.gps_check_verdict IS
  '写真GPSと店舗位置の整合性判定: match_store / mismatch / no_gps / no_reference。生座標は保存しない。';
COMMENT ON COLUMN certificate_images.gps_distance_bucket IS
  '基準座標からの距離帯（within_1km / within_10km / within_50km / beyond_50km）。精密な位置は残さない。';
