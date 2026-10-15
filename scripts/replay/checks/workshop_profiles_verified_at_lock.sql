-- 施工店の設備・資格の「検証済み」（verified_at）を、施工店（authenticated）からは変えられないことを行を入れて確かめる。
--
-- なぜ要るか: 施工店向けの書き込みポリシーは列を絞っていない。止めているのは
-- 20261015122000 のトリガー1本だけで、消えても構文も型も通る。壊れたことが分かるのは
-- 施工店が自分で「検証済み」を名乗ったときだけなので、振る舞いで見る。
-- 陽性対照として「施工店は他の列は更新できる」「service role は付けられる」も確かめる。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c0ffe', true);

INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-0000000c0ffe');
INSERT INTO public.tenants (id, name, slug)
VALUES ('00000000-0000-4000-8000-0000000002a1', 'verified-lock tenant', 'verified-lock-tenant');
INSERT INTO public.tenant_memberships (tenant_id, user_id)
VALUES ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000c0ffe');

DO $$
DECLARE
  k_tenant constant uuid := '00000000-0000-4000-8000-0000000002a1';
  k_verified constant timestamptz := '2026-10-01T00:00:00Z';
  v timestamptz;
  lift boolean;
BEGIN
  -- 運営（マイグレーション・SQL）は付けられる
  INSERT INTO public.workshop_capability_profiles (tenant_id, verified_at) VALUES (k_tenant, k_verified);

  -- 施工店: 他の列は更新できるが、verified_at は消すことも付け替えることもできない
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.workshop_capability_profiles SET has_lift = true, verified_at = NULL WHERE tenant_id = k_tenant;
  UPDATE public.workshop_capability_profiles SET verified_at = now() WHERE tenant_id = k_tenant;
  EXECUTE 'RESET ROLE';
  SELECT verified_at, has_lift INTO v, lift FROM public.workshop_capability_profiles WHERE tenant_id = k_tenant;
  IF lift IS DISTINCT FROM true THEN
    RAISE EXCEPTION '施工店が自分の設備・資格を更新できない（has_lift=%）。ロックが他の列まで止めている', lift;
  END IF;
  IF v IS DISTINCT FROM k_verified THEN
    RAISE EXCEPTION '施工店が verified_at を変えられた（% → %）', k_verified, v;
  END IF;

  -- 施工店: 新規で verified_at を付けても NULL になる
  DELETE FROM public.workshop_capability_profiles WHERE tenant_id = k_tenant;
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.workshop_capability_profiles (tenant_id, verified_at) VALUES (k_tenant, now());
  EXECUTE 'RESET ROLE';
  SELECT verified_at INTO v FROM public.workshop_capability_profiles WHERE tenant_id = k_tenant;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION '施工店が新規作成で verified_at を付けられた（%）', v;
  END IF;

  -- service role（サーバー側）は付けられる
  EXECUTE 'SET LOCAL ROLE service_role';
  UPDATE public.workshop_capability_profiles SET verified_at = k_verified WHERE tenant_id = k_tenant;
  EXECUTE 'RESET ROLE';
  SELECT verified_at INTO v FROM public.workshop_capability_profiles WHERE tenant_id = k_tenant;
  IF v IS DISTINCT FROM k_verified THEN
    RAISE EXCEPTION 'service role が verified_at を付けられない（%）', v;
  END IF;
END $$;

ROLLBACK;
