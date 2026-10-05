-- `file_size` を省いた certificate_images の insert が「どう失敗するか」を確かめる。
--
-- なぜ要るか: 本番は `file_size bigint NOT NULL`（既定なし）だが、マイグレーション側は
-- `DEFAULT 0`（NULL 可）のままだった（20260313020000_core_tables.sql:112）。
-- そこへ 20260922123100 が本番の `CHECK (file_size > 0)` を写したので、
-- **既定値が自分の CHECK に弾かれる**という自己矛盾が生まれた。
-- 20260922141100 が既定を外して NOT NULL にし、本番と揃えた。
--
-- 検査のしかた: NOT NULL は行を組み立てる時点で見られ、外部キーのトリガは
-- 行が入った**後**に走る。だから存在しない certificate_id・tenant_id でも、
-- NOT NULL が効いていれば 23502（not_null_violation）で止まる。
-- 既定が復活すると 0 が入って CHECK に進み 23514 になり、NOT NULL が外れると
-- NULL のまま CHECK を素通りして外部キー 23503 になる。**どちらもここで落ちる。**
--
-- 取りこぼし: 2026-09-25 に 20260925142800 が `file_name` / `content_type` を
-- NOT NULL にした時点で、**この検査は file_size を見なくなっていた**。
-- 列を3つとも省いた insert は、どの NOT NULL で落ちても 23502 なので、
-- 20260922141100 を丸ごと戻しても通ってしまう状態だった（/code-review 指摘）。
-- だから insert は file_size 以外の NOT NULL 列を明示で渡す。
-- 同表に NOT NULL 列を足す PR は、この insert にもその列を足すこと。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

DO $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    -- file_size **以外**の NOT NULL 列はすべて渡す。渡さないと 20260925142800 で
    -- NOT NULL になった file_name / content_type が先に 23502 を出し、
    -- この検査が file_size とは無関係に通ってしまう（冒頭の「取りこぼし」参照）。
    INSERT INTO public.certificate_images (certificate_id, tenant_id, storage_path, file_name, content_type)
    VALUES (
      '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000e2',
      'certificates/e1/photo.jpg',
      'photo.jpg',
      'image/jpeg'
    );
    v_state := 'INSERTED';
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;

  IF v_state <> '23502' THEN
    RAISE EXCEPTION
      'file_size を省いた insert が not_null_violation(23502) にならない（実際: %）。'
      '既定が復活したか NOT NULL が外れている', v_state;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'certificate_images_file_size_check'
      AND conrelid = 'public.certificate_images'::regclass
  ) THEN
    RAISE EXCEPTION 'certificate_images_file_size_check が無い。検査側が外れている';
  END IF;

  RAISE NOTICE 'certificate_images.file_size: 既定なし・NOT NULL で本番と一致';
END $$;

ROLLBACK;
