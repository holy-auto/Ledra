-- =============================================================
-- vehicles: public_id — 物理タグ (NFC/QR) に焼く外部公開ID
--
-- 内部 UUID (id) を物理タグに露出させないため、短いランダム識別子を
-- 別に持たせる。job_orders (20260325500000) と同じ
-- 'prefix_' + gen_random_uuid()(ハイフン除去) 方式。
--
-- ADD COLUMN は nullable かつ DEFAULT 無し で即時 (テーブル書換なし)。
-- バックフィルを別ステートメントで行い、その後 INSERT 用 DEFAULT を設定する。
-- 一意インデックスは CONCURRENTLY のため別ファイル
-- (20260711000003_vehicles_public_id_unique_index.sql)。
-- =============================================================

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS public_id text;

-- 既存行に採番 (NULL を残さない)。
-- ponytail: 全行 UPDATE。~数千行規模なら一括で問題ない。数十万行に育ったら
-- バッチ分割 (id 範囲でチャンク) に切り替える。
UPDATE vehicles
SET public_id = 'veh_' || replace(gen_random_uuid()::text, '-', '')
WHERE public_id IS NULL;

-- INSERT 時に省略された場合の既定値 (カタログのみ更新・書換なし)。
ALTER TABLE vehicles
  ALTER COLUMN public_id SET DEFAULT ('veh_' || replace(gen_random_uuid()::text, '-', ''));
