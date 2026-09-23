-- =============================================================
-- 工数マスタに TC コード（同じ型式の中の仕様違い）の軸を足す
--
-- 背景: 同じ型式でも車によって工数が違う品目がある（JF5 の2台で共通116品目中6品目が不一致）。
--   TC コードで差があるときはそれも反映する（2026-09-23 代表判断）。
--   tc_code = '' は「TC コードを問わない」行。算出は (型式, TC) → (型式, '') → ('*', '') の順で引く
--   （src/lib/pricing/laborMaster.ts findEntry）。既存行はすべて '' になる。
-- =============================================================

ALTER TABLE labor_hour_masters
  ADD COLUMN IF NOT EXISTS tc_code text NOT NULL DEFAULT '' CHECK (length(tc_code) <= 20);

ALTER TABLE labor_hour_masters DROP CONSTRAINT IF EXISTS labor_hour_masters_key_uniq;
ALTER TABLE labor_hour_masters
  ADD CONSTRAINT labor_hour_masters_key_uniq UNIQUE (tenant_id, model_code, tc_code, part_key);

COMMENT ON COLUMN labor_hour_masters.tc_code IS
  'TC コード（正規化済み）。空文字 = TC コードを問わない。工数が TC コードで違うときだけ入れる。';
