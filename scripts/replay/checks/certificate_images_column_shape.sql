-- `certificate_images` の列定義が本番と同じ形かを、**実際に insert して**確かめる。
--
-- なぜ要るか: この表は 45 列のうち3件が本番と食い違っていた
-- （`file_name` / `content_type` が本番 NOT NULL・再生は NULL 可、
--  `sort_order` の既定が本番 1・再生 0）。20260925142800 で揃えた。
--
-- 名前しか見ない検査では映らない: ドリフト検出器と `check:schema` は列名だけを
-- 突き合わせる（検出器の「ponytail: 上限その2」）。だから NULL 可否と既定値は
-- **値を入れて**確かめるしかない。
--
-- 検査のしかた: NOT NULL は行を組み立てる時点で見られ、外部キーのトリガは
-- その後に走る。だから存在しない certificate_id / tenant_id でも、
-- 列を省いたときに返るのは 23502（NOT NULL 違反）で、揃っていれば
-- 23503（外部キー）か挿入成功になる。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

DO $$
DECLARE
  v_cert uuid := '00000000-0000-4000-8000-0000000000c1';
  v_tenant uuid := '00000000-0000-4000-8000-0000000000c2';
  v_state text;
  v_default int;
BEGIN
  -- (1) file_name を省くと NOT NULL で落ちるか
  BEGIN
    INSERT INTO public.certificate_images (certificate_id, tenant_id, storage_path, content_type, file_size)
    VALUES (v_cert, v_tenant, 'x/y.jpg', 'image/jpeg', 1);
    v_state := 'INSERTED';
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;
  IF v_state <> '23502' THEN
    RAISE EXCEPTION 'file_name を省いた行が NOT NULL で落ちない（実際: %）。本番は NOT NULL', v_state;
  END IF;

  -- (2) content_type を省くと NOT NULL で落ちるか
  BEGIN
    INSERT INTO public.certificate_images (certificate_id, tenant_id, storage_path, file_name, file_size)
    VALUES (v_cert, v_tenant, 'x/y.jpg', 'y.jpg', 1);
    v_state := 'INSERTED';
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;
  IF v_state <> '23502' THEN
    RAISE EXCEPTION 'content_type を省いた行が NOT NULL で落ちない（実際: %）。本番は NOT NULL', v_state;
  END IF;

  -- (3) 3列とも渡せば NOT NULL では落ちない（外部キーまで到達する）＝
  --     上の2件が「NOT NULL のせい」であることの陽性対照。
  BEGIN
    INSERT INTO public.certificate_images (certificate_id, tenant_id, storage_path, file_name, content_type, file_size)
    VALUES (v_cert, v_tenant, 'x/y.jpg', 'y.jpg', 'image/jpeg', 1);
    v_state := 'INSERTED';
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;
  IF v_state = '23502' THEN
    RAISE EXCEPTION '3列を渡しても NOT NULL で落ちる。別の列にも NOT NULL が付いている';
  END IF;

  -- (4) sort_order の既定が 1 か。既定は行が入らないと確かめられないので、
  --     外部キーを満たす行を用意してから省略して入れる。
  INSERT INTO public.tenants (id, name) VALUES (v_tenant, '検査用ダミー店')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.certificates (id, tenant_id, public_id, status)
  VALUES (v_cert, v_tenant, 'c_' || repeat('0', 24), 'draft')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.certificate_images (certificate_id, tenant_id, storage_path, file_name, content_type, file_size)
  VALUES (v_cert, v_tenant, 'x/default.jpg', 'default.jpg', 'image/jpeg', 1);

  SELECT sort_order INTO v_default
  FROM public.certificate_images
  WHERE certificate_id = v_cert AND storage_path = 'x/default.jpg';

  IF v_default IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'sort_order の既定が % になっている（本番は 1）', v_default;
  END IF;

  RAISE NOTICE 'certificate_images: file_name / content_type は NOT NULL、sort_order の既定は 1';
END $$;

ROLLBACK;
