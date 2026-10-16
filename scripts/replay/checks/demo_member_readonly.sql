-- 公開デモアカウント（デモテナントの所属者）は、ブラウザから DB を直接書いても書けないことを確かめる（20261016132455）。
--
-- なぜ要るか: 止めているのは表ごとの RESTRICTIVE ポリシーで、新しい表に付け忘れても構文も型も通る。
-- 付け忘れた表は、公開のログイン情報で誰でも PostgREST から書ける。
-- (1) public の全表と storage.objects にポリシーが付いているか、(2) 実際にデモの所属者だけが書けないか、を見る。
-- 陽性対照として、別テナントの owner は同じ書き込みができることも確かめる。
--
-- 落ちたら: 新しい表なら、20261016132455_demo_member_readonly_all_tables.sql の DO ブロックを
-- 新しいマイグレーションにそのまま写して流す（付いている表は飛ばす）。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

-- (1) 付け忘れ
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c.oid::regclass::text, ', ' ORDER BY c.relname) INTO missing
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
    AND (SELECT count(*) FROM pg_policy p
         WHERE p.polrelid = c.oid AND NOT p.polpermissive
           AND p.polname IN ('demo_member_readonly_insert', 'demo_member_readonly_update', 'demo_member_readonly_delete')) <> 3;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'デモの書き込みを断るポリシーが無い表: %（20261016132455 の DO ブロックを新しいマイグレーションで流す）', missing;
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND NOT polpermissive
      AND polname LIKE 'demo_member_readonly_%') <> 3 THEN
    RAISE EXCEPTION 'storage.objects にデモの書き込みを断るポリシーが 3 本ない';
  END IF;
END $$;

-- (2) 振る舞い。デモの owner と、別テナントの owner を作る
INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-00000000de01'), ('00000000-0000-4000-8000-00000000de02');
INSERT INTO public.tenants (id, name, slug) VALUES
  ('00000000-0000-0000-0000-de0000000010', 'demo tenant', 'demo-readonly-check'),
  ('00000000-0000-4000-8000-0000000003a1', 'other tenant', 'demo-readonly-check-other');
INSERT INTO public.tenant_memberships (tenant_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-de0000000010', '00000000-0000-4000-8000-00000000de01', 'owner'),
  ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-00000000de02', 'owner');
INSERT INTO public.staff_members (id, tenant_id, name) VALUES
  ('00000000-0000-4000-8000-0000000003b1', '00000000-0000-0000-0000-de0000000010', 'demo staff'),
  ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003a1', 'other staff');

-- Supabase と同じく storage.objects に RLS を掛け、authenticated に書き込み権限を渡す（再生用の最小形には無い）
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
INSERT INTO storage.buckets (id, name) VALUES ('market', 'market') ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  k_demo_tenant constant uuid := '00000000-0000-0000-0000-de0000000010';
  k_other_tenant constant uuid := '00000000-0000-4000-8000-0000000003a1';
  n int;
  denied boolean;
BEGIN
  -- 別テナントの owner: 書ける（陽性対照。ポリシーが全員を止めていないか）
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000de02', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.staff_members (tenant_id, name) VALUES (k_other_tenant, 'added by other owner');
  UPDATE public.staff_members SET name = 'renamed' WHERE id = '00000000-0000-4000-8000-0000000003b2';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '別テナントの owner が自分のスタッフを更新できない（% 行）', n; END IF;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('market', 'vehicles/' || k_other_tenant || '/a.jpg');
  PERFORM public.replace_staff_shifts('00000000-0000-4000-8000-0000000003b2', '[]'::jsonb);
  EXECUTE 'RESET ROLE';

  -- デモの owner: 追加は落ち、更新・削除は 0 行、RPC と Storage も落ちる
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000de01', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  denied := false;
  BEGIN
    INSERT INTO public.staff_members (tenant_id, name) VALUES (k_demo_tenant, 'added by demo');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'デモの所属者が staff_members に追加できた'; END IF;

  UPDATE public.staff_members SET name = 'renamed by demo' WHERE id = '00000000-0000-4000-8000-0000000003b1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'デモの所属者が staff_members を更新できた（% 行）', n; END IF;
  DELETE FROM public.staff_members WHERE id = '00000000-0000-4000-8000-0000000003b1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'デモの所属者が staff_members を削除できた（% 行）', n; END IF;

  denied := false;
  BEGIN
    PERFORM public.replace_staff_shifts('00000000-0000-4000-8000-0000000003b1', '[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'デモの所属者が replace_staff_shifts（RLS を通らない RPC）で書けた'; END IF;

  denied := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('market', 'vehicles/' || k_demo_tenant || '/a.jpg');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'デモの所属者が Storage にアップロードできた'; END IF;

  -- 見るのは止めない
  SELECT count(*) INTO n FROM public.staff_members WHERE tenant_id = k_demo_tenant;
  IF n <> 1 THEN RAISE EXCEPTION 'デモの所属者が自分のテナントのスタッフを読めない（% 行）', n; END IF;
  EXECUTE 'RESET ROLE';
END $$;

ROLLBACK;
