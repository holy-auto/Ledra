-- `public_id` を省いた車両の insert が通るかを、行を入れて確かめる。
--
-- なぜ要るか: `vehicles.public_id` には**生成側（DEFAULT）と検査側（CHECK）の2つ**があり、
-- 片方だけを本番から写すと、空 DB から作った環境でだけ車両登録が 23514 で落ちる。
-- 2026-09-22 に実際それをやった —— 本番から `vehicles_public_id_format_chk`
-- （`'^v_[0-9a-f]{24}$'`）だけを取り込み、既定は `'veh_' || …`（32桁）のままだった。
-- **アプリは `public_id` を省いて insert する**ので、通常の車両登録が通らなくなる。
--
-- 検出器は列の「名前」しか見ないので、この食い違いはどの検査にも映らない。
-- だから行を入れて確かめる。DEFAULT と CHECK のどちらが変わっても落ちる。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

INSERT INTO public.tenants (id, name, slug)
VALUES ('00000000-0000-4000-8000-0000000000d1', 'pubid-check tenant', 'pubid-check-tenant');

DO $$
DECLARE
  v_public_id text;
BEGIN
  -- public_id を**省いて**入れる（アプリの通常経路と同じ）。
  INSERT INTO public.vehicles (id, tenant_id)
  VALUES ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d1')
  RETURNING public_id INTO v_public_id;

  IF v_public_id IS NULL THEN
    RAISE EXCEPTION 'public_id の既定が無い。DEFAULT が外れている';
  END IF;

  -- 既定が CHECK を通る形であることまで見る（通っていれば insert 自体が成功しているが、
  -- CHECK が外れた場合に気づけるよう、形も明示的に確かめる）。
  IF v_public_id !~ '^v_[0-9a-f]{24}$' THEN
    RAISE EXCEPTION
      '既定が生成した public_id が想定の形ではない（%）。生成側と検査側がずれている', v_public_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vehicles_public_id_format_chk'
      AND conrelid = 'public.vehicles'::regclass
  ) THEN
    RAISE EXCEPTION 'vehicles_public_id_format_chk が無い。検査側が外れている';
  END IF;

  RAISE NOTICE '車両の public_id: 既定（%）が CHECK を通る', v_public_id;
END $$;

ROLLBACK;
