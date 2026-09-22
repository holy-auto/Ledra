-- ============================================================
-- vehicles.public_id の既定を本番と同じ生成関数へ揃える
-- ============================================================
-- **これは 20260922123100 が持ち込んだ破壊の修正である。**
--
-- 20260922123100 は本番にある `vehicles_public_id_format_chk`
-- （`CHECK (public_id ~ '^v_[0-9a-f]{24}$')`）をマイグレーション側へ取り込んだ。
-- ところが**既定値が本番とマイグレーションで違っていた**:
--
--   本番            DEFAULT generate_vehicle_public_id()      → 'v_' + 24桁hex  → CHECK を通る
--   マイグレーション DEFAULT 'veh_' || replace(gen_random_uuid()::text,'-','')
--                                                            → 'veh_' + 32桁hex → CHECK に弾かれる
--
-- つまり空 DB から作った環境（プレビュー分岐・新環境）では、`public_id` を省いた
-- 車両の作成が 23514 で必ず失敗する。`src/app/api/vehicles/create/route.ts` は省くので、
-- **通常の車両登録が通らなくなる**（Codex の P1 指摘。2026-09-22）。
-- 本番は既定が生成関数なので無傷。実データも違反0件（27行すべて `v_` 始まり・実測）。
--
-- 直し方は既定を本番に合わせること。`generate_vehicle_public_id()` は
-- `20260907010100_repair_unmanaged_objects.sql` が定義していて、本番のものと同一
-- （`'v_' || encode(gen_random_bytes(12), 'hex')` = `v_` + 24桁hex）。
-- **本番では既にこの既定なので no-op。**
--
-- なぜ見落としたか: 検出器も突き合わせも**列の「名前」しか見ていない**。
-- 既定値・型は比較の対象外で、20260922123100 のヘッダにもその上限を書いていたのに、
-- 「本番から写した CHECK なら安全」と考えて既定値まで確かめなかった。
-- MISTAKE_LEDGER `M-20260922-copied-a-check-without-checking-the-default`。
-- ============================================================

ALTER TABLE public.vehicles
  ALTER COLUMN public_id SET DEFAULT public.generate_vehicle_public_id();

-- 既存行の後始末。
-- `20260711000002` は全行を `'veh_' || …` で埋める UPDATE を持つ。その形式の行は
-- `vehicles_public_id_format_chk` を通らない。制約は NOT VALID なので既存行の検証は
-- 走らないが、**NOT VALID でも INSERT と UPDATE は検査される**。つまり古い形式の行は
-- 「読めるが二度と更新できない行」になる。
-- 本番は該当 0 件（27 行すべて `v_` 始まり・2026-09-22 実測）なので no-op。
-- 既にデータを持つ開発・ステージング DB のために揃えておく。
-- `public_id` を外部キーで参照している表は無い（本番の pg_constraint で確認済み）ので、
-- 採番し直しても参照は壊れない。
UPDATE public.vehicles
SET public_id = public.generate_vehicle_public_id()
WHERE public_id !~ '^v_[0-9a-f]{24}$';
