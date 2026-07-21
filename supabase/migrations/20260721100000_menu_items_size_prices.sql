-- 品目マスタ (menu_items) にサイズ別価格を持たせる。
--
-- 背景: コーティング等は車両サイズ (SS〜XL) やホイールインチで価格が変わるが、現状は
-- 1レコード=1単価のため「コーティングS」「コーティングM」…と別レコードを量産するしかなく、
-- 登録が煩雑で概算計算 (quoteReplyAuto) とも噛み合っていなかった。
--
-- 追加する列:
--   size_axis   … このメニューの価格軸。null=従来どおり単一単価 / 'vehicle_size'=車両サイズ
--                 (SS/S/M/L/LL/XL) / 'wheel_size'=ホイールインチ。
--   size_prices … 軸の段 -> 税抜価格(整数円) の対応表 (JSON)。
--                 例(vehicle_size): {"SS":8000,"S":9000,"M":10000,"L":12000,"LL":14000,"XL":16000}
--                 例(wheel_size):   {"16":5000,"17":6000,"18":7000,"19":8000,"20":9000}
--
-- additive / nullable / デフォルト無し = 既存行は size_axis=null のまま従来挙動を維持 (後方互換)。
-- 軸と段キーの妥当性検証はアプリ層 (src/lib/validations/menu-item.ts) で行う (DB CHECK は付けない:
-- 既存行の全表スキャンを避け zero-downtime を保つため)。

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS size_axis text,
  ADD COLUMN IF NOT EXISTS size_prices jsonb;

COMMENT ON COLUMN menu_items.size_axis IS
  'サイズ別価格の軸。null=単一単価(従来) / vehicle_size(SS〜XL) / wheel_size(インチ)。';
COMMENT ON COLUMN menu_items.size_prices IS
  'サイズの段 -> 税抜価格(整数円) の対応表 (JSON)。size_axis が非nullのとき参照する。';
