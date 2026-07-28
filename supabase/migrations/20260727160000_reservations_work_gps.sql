-- 出張作業場所のGPS（モバイル端末で作業開始/完了時に取得）を予約に記録する列。
-- 用途: 写真GPS×作業場所の整合性チェック（match_worksite）で、店舗から離れた出張現場の
-- 写真を「正当」と判定できるようにする。
--
-- プライバシー: work_lat/work_lng は出張＝顧客宅の位置になり得る運用データ。
--   reservations は既にテナント/スタッフ限定のRLS配下で、顧客ポータル・保険ポータルからは
--   参照できない（これらのポータルは reservations.work_* を SELECT しない）。座標は最小権限で
--   スタッフ運用目的にのみ保持する。写真側は従来どおり結果(verdict)のみ保存し生座標は残さない。
-- 追加のみ・NULL 許容・デフォルト無しで後方互換。
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS work_lat double precision,
  ADD COLUMN IF NOT EXISTS work_lng double precision,
  ADD COLUMN IF NOT EXISTS work_gps_at timestamptz;

COMMENT ON COLUMN reservations.work_lat IS
  '出張作業場所の緯度（モバイルGPS・スタッフ運用限定。顧客/保険ポータルには非公開）。';
COMMENT ON COLUMN reservations.work_lng IS
  '出張作業場所の経度（モバイルGPS・スタッフ運用限定。顧客/保険ポータルには非公開）。';
COMMENT ON COLUMN reservations.work_gps_at IS
  '出張作業場所GPSを取得した時刻（作業開始/完了時）。';
