-- 保険会社 RPC の停止ゲートが実際に効くかを、行を入れて確かめる。
--
-- なぜ要るか: public.current_insurer_access() は「保険会社ユーザが顧客データを
-- 読んでよいか」を決める唯一の場所で、5本の RPC がこれを呼ぶ。条件を1つ落としても
-- 構文は通るし plpgsql_check も通る（型も名前も正しいので）。**壊れたことが分かるのは
-- 停止したはずの保険会社が顧客データを読めたときだけ** なので、振る舞いで確かめる。
--
-- 検査の形（/code-review の指摘で3点強くした）:
--   1. 件数だけでなく**返ってくる値**まで見る。select の並びを入れ替えただけでも落ちる
--   2. ヘルパだけでなく**5本の RPC すべて**を実際に呼ぶ。1本が直読みに戻ったら落ちる
--   3. 「停止中Aと有効Bに属するユーザ」を陰性対照に入れる。**選んでから判定**の順序が
--      崩れて「停止を除いてから選ぶ」形になると、ルート層より緩くなるので落とす
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

-- auth.uid() は request.jwt.claim.sub を読む（scripts/replay/bootstrap.sql）。
-- SET LOCAL ではなく set_config を使う: SET は「接頭辞.名前」の2段しか受け付けず、
-- この4段の名前は構文エラーになる。set_config は文字列なので通る。
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000c0de', true);

INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-00000000c0de');

INSERT INTO public.tenants (id, name, slug)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'gate-check tenant', 'gate-check-tenant');

INSERT INTO public.insurers (id, name, slug, is_active, status)
VALUES ('00000000-0000-4000-8000-0000000000b1', 'gate-check insurer', 'gate-check-insurer', true, 'active');

INSERT INTO public.insurer_users (id, insurer_id, user_id, is_active, created_at)
VALUES ('00000000-0000-4000-8000-0000000000c1',
        '00000000-0000-4000-8000-0000000000b1',
        '00000000-0000-4000-8000-00000000c0de',
        true, '2026-01-01T00:00:00Z');

DO $$
DECLARE
  k_user      CONSTANT uuid := '00000000-0000-4000-8000-00000000c0de';
  k_insurer   CONSTANT uuid := '00000000-0000-4000-8000-0000000000b1';
  k_membership CONSTANT uuid := '00000000-0000-4000-8000-0000000000c1';
  k_insurer_b CONSTANT uuid := '00000000-0000-4000-8000-0000000000b2';
  n    int;
  a_iu uuid;
  a_in uuid;
  sig  text;
  msg  text;
  denied int;
  passed int;
BEGIN
  -- ── 陽性対照1: active は通り、**返る値も正しい** ────────────────────────────
  -- count(*) だけ見ていると、select の並びを入れ替えて
  -- (insurer_id, insurer_user_id) を返す壊れ方を素通りさせてしまう。
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 1 THEN
    RAISE EXCEPTION 'active な保険会社が通らない（% 件）。ゲートが厳しすぎる', n;
  END IF;

  SELECT insurer_user_id, insurer_id INTO a_iu, a_in FROM public.current_insurer_access();
  IF a_iu <> k_membership OR a_in <> k_insurer THEN
    RAISE EXCEPTION
      '返り値が入れ替わっている: insurer_user_id=% insurer_id=%（期待 % / %）',
      a_iu, a_in, k_membership, k_insurer;
  END IF;

  -- ── 陽性対照2: 審査中（active_pending_review）も通る ──────────────────────
  -- ルート層 resolveInsurerCaller が許しているので、DB 側だけ弾くと画面が割れる
  UPDATE public.insurers SET status = 'active_pending_review' WHERE id = k_insurer;
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 1 THEN
    RAISE EXCEPTION 'active_pending_review が通らない（% 件）', n;
  END IF;

  -- ── 陽性対照3: 5本の RPC が active では認可で落ちない ─────────────────────
  -- 「Not an active insurer user」以外で落ちるのは構わない
  -- （テナント未許可・証明書なしなど、認可より先の理由）。
  UPDATE public.insurers SET status = 'active' WHERE id = k_insurer;
  passed := 0;
  FOREACH sig IN ARRAY ARRAY[
    'select * from public.insurer_search_vehicles('''', 1, 0, null, null)',
    'select * from public.insurer_search_certificates('''', 1, 0, null, null)',
    'select * from public.insurer_search_stores('''', 1, 0, null, null)',
    'select * from public.insurer_get_certificate(''no-such-public-id'', null, null)',
    'select * from public.insurer_get_vehicle_certificates(''00000000-0000-4000-8000-0000000000f1'', null, null)'
  ] LOOP
    BEGIN
      EXECUTE sig;
      passed := passed + 1;
    EXCEPTION WHEN others THEN
      msg := SQLERRM;
      IF msg = 'Not an active insurer user' THEN
        RAISE EXCEPTION 'active なのに認可で落ちた: %', sig;
      END IF;
      passed := passed + 1;  -- 認可より先の理由なので通過とみなす
    END;
  END LOOP;
  IF passed <> 5 THEN
    RAISE EXCEPTION '陽性対照3で 5 本を通せていない（% 本）', passed;
  END IF;

  -- ── 陰性対照1: 停止中は通さない。これがこの検査の本体 ─────────────────────
  UPDATE public.insurers SET status = 'suspended' WHERE id = k_insurer;
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 0 THEN
    RAISE EXCEPTION '停止中の保険会社が顧客データ経路を通れる（% 件）', n;
  END IF;

  -- ── 陰性対照2: 停止中は **5本とも** 認可で落ちる ──────────────────────────
  -- ヘルパだけ直っていて RPC の1本が insurer_users の直読みに戻っていたら、ここで落ちる
  denied := 0;
  FOREACH sig IN ARRAY ARRAY[
    'select * from public.insurer_search_vehicles('''', 1, 0, null, null)',
    'select * from public.insurer_search_certificates('''', 1, 0, null, null)',
    'select * from public.insurer_search_stores('''', 1, 0, null, null)',
    'select * from public.insurer_get_certificate(''no-such-public-id'', null, null)',
    'select * from public.insurer_get_vehicle_certificates(''00000000-0000-4000-8000-0000000000f1'', null, null)'
  ] LOOP
    BEGIN
      EXECUTE sig;
      RAISE EXCEPTION '停止中なのに認可を通した: %', sig;
    EXCEPTION WHEN others THEN
      msg := SQLERRM;
      IF msg = 'Not an active insurer user' THEN
        denied := denied + 1;
      ELSIF msg LIKE '停止中なのに認可を通した%' THEN
        RAISE;
      ELSE
        RAISE EXCEPTION
          '停止中の % が認可以外の理由で落ちた（%）。ゲートを通り抜けている可能性がある', sig, msg;
      END IF;
    END;
  END LOOP;
  IF denied <> 5 THEN
    RAISE EXCEPTION '停止中に拒否された RPC が 5 本に満たない（% 本）', denied;
  END IF;

  -- ── 陰性対照3: insurers.is_active = false も通さない ──────────────────────
  UPDATE public.insurers SET status = 'active', is_active = false WHERE id = k_insurer;
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 0 THEN
    RAISE EXCEPTION 'is_active=false の保険会社が通れる（% 件）', n;
  END IF;

  -- ── 陰性対照4: insurer_users.is_active = false も通さない（従来挙動の退行確認）──
  UPDATE public.insurers SET is_active = true WHERE id = k_insurer;
  UPDATE public.insurer_users SET is_active = false WHERE id = k_membership;
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 0 THEN
    RAISE EXCEPTION '無効化された保険会社ユーザが通れる（% 件）', n;
  END IF;

  -- ── 陰性対照5: 「選んでから判定」の順序 ───────────────────────────────────
  -- 停止中A（古い）と有効B（新しい）に属するユーザ。ルート層は A を選んでから
  -- A の停止を見て 401 にする（B へは落ちない）。DB も同じでなければ、
  -- **ルートが 401 のケースで RPC だけが B のデータを返す**ことになる。
  UPDATE public.insurer_users SET is_active = true WHERE id = k_membership;
  UPDATE public.insurers SET status = 'suspended' WHERE id = k_insurer;  -- A = 停止中
  INSERT INTO public.insurers (id, name, slug, is_active, status)
  VALUES (k_insurer_b, 'gate-check insurer B', 'gate-check-insurer-b', true, 'active');
  INSERT INTO public.insurer_users (id, insurer_id, user_id, is_active, created_at)
  VALUES ('00000000-0000-4000-8000-0000000000c2', k_insurer_b, k_user, true, '2026-06-01T00:00:00Z');

  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 0 THEN
    RAISE EXCEPTION
      '停止中Aを選ぶべき場面で有効Bに落ちている（% 件）。「停止を除いてから選ぶ」形になっており、ルート層より緩い', n;
  END IF;

  -- ── 陰性対照6: 別人のセッションでは通らない（auth.uid() を見ていることの確認）──
  UPDATE public.insurers SET status = 'active' WHERE id = k_insurer;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000dead', true);
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 0 THEN
    RAISE EXCEPTION '無関係なユーザが通れる（% 件）。auth.uid() を見ていない', n;
  END IF;

  RAISE NOTICE '保険会社の停止ゲート: 陽性対照3件・陰性対照6件すべて期待どおり';
END $$;

ROLLBACK;
