-- =============================================================
-- certificates.damage_map_json
--
-- 傷・損傷位置マップ（車両展開図へタップで置いたマーカー群）。
-- 証明書フォームの DamageMapSection が hidden input で送る
-- { version, markers: [{ id, x, y, kind, note }] }（x,y は 0..1 正規化）を保存する。
--
-- 既存の certificates.body_repair_json / coating_products_json / film_thickness_json と
-- 同じ「フォームの構造化 JSON をそのまま持つ」パターン。nullable jsonb で追加（zero-downtime）。
-- IF NOT EXISTS で再実行に耐える。
-- =============================================================

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS damage_map_json jsonb;

COMMENT ON COLUMN certificates.damage_map_json IS
  '傷・損傷位置マップ { version, markers:[{id,x,y,kind,note}] }（x,y は車両図 viewBox の 0..1 正規化座標）。DamageMapSection が保存。';
