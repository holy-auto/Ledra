-- 保険会社 RPC の停止ゲートが実際に効くかを、行を入れて確かめる。
--
-- なぜ要るか: public.current_insurer_access() は「保険会社ユーザが顧客データを
-- 読んでよいか」を決める唯一の場所で、5本の RPC がこれを呼ぶ。条件を1つ落としても
-- 構文は通るし plpgsql_check も通る（型も名前も正しいので）。**壊れたことが分かるのは
-- 停止したはずの保険会社が顧客データを読めたときだけ** なので、振る舞いで確かめる。
--
-- 検査の形: 実際に行を入れ、auth.uid() をそのユーザに見せかけ、
-- 「通る / 通らない」を1件ずつ数える。最後に ROLLBACK するので DB には何も残らない。
--
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

INSERT INTO public.insurer_users (id, insurer_id, user_id, is_active)
VALUES ('00000000-0000-4000-8000-0000000000c1',
        '00000000-0000-4000-8000-0000000000b1',
        '00000000-0000-4000-8000-00000000c0de',
        true);

DO $$
DECLARE
  n int;
BEGIN
  -- 陽性対照1: active は通る。ここが 0 なら保険会社ポータルが全滅する
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 1 THEN
    RAISE EXCEPTION 'active な保険会社が通らない（% 件）。ゲートが厳しすぎる', n;
  END IF;

  -- 陽性対照2: 審査中（active_pending_review）も通る。
  -- ルート層 resolveInsurerCaller が許しているので、DB 側だけ弾くと画面が割れる
  UPDATE public.insurers SET status = 'active_pending_review'
   WHERE id = '00000000-0000-4000-8000-0000000000b1';
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 1 THEN
    RAISE EXCEPTION 'active_pending_review が通らない（% 件）', n;
  END IF;

  -- 陰性対照1: 停止中は通さない。これがこの検査の本体
  UPDATE public.insurers SET status = 'suspended'
   WHERE id = '00000000-0000-4000-8000-0000000000b1';
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 0 THEN
    RAISE EXCEPTION '停止中の保険会社が顧客データ経路を通れる（% 件）', n;
  END IF;

  -- 陰性対照2: insurers.is_active = false も通さない
  UPDATE public.insurers SET status = 'active', is_active = false
   WHERE id = '00000000-0000-4000-8000-0000000000b1';
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 0 THEN
    RAISE EXCEPTION 'is_active=false の保険会社が通れる（% 件）', n;
  END IF;

  -- 陰性対照3: 従来からある insurer_users.is_active = false も通さない（退行の確認）
  UPDATE public.insurers SET is_active = true
   WHERE id = '00000000-0000-4000-8000-0000000000b1';
  UPDATE public.insurer_users SET is_active = false
   WHERE id = '00000000-0000-4000-8000-0000000000c1';
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 0 THEN
    RAISE EXCEPTION '無効化された保険会社ユーザが通れる（% 件）', n;
  END IF;

  -- 陰性対照4: 別人のセッションでは通らない（auth.uid() を見ていることの確認）
  UPDATE public.insurer_users SET is_active = true
   WHERE id = '00000000-0000-4000-8000-0000000000c1';
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000dead', true);
  SELECT count(*) INTO n FROM public.current_insurer_access();
  IF n <> 0 THEN
    RAISE EXCEPTION '無関係なユーザが通れる（% 件）。auth.uid() を見ていない', n;
  END IF;

  RAISE NOTICE '保険会社の停止ゲート: 陽性対照2件・陰性対照4件すべて期待どおり';
END $$;

ROLLBACK;
