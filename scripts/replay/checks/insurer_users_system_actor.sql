-- 自動処理用の「システム行」が (a) 保険会社ごとに1つ在り、(b) 自動処理の監査行を
-- 実際に受け取れて、(c) 誰にもアクセス権を与えないこと、を実際に動かして確かめる。
--
-- なぜ要るか: `caseSummaryAuto` / `caseAssignAuto` / `fraudScoreAuto` の3本は
-- `insurer_access_logs` に `insurer_user_id` を渡しておらず、この列が NOT NULL なため
-- **毎回 23502 で落ちていた**（2026-09-24 に本番で実測）。しかも `.then(() => {})` で
-- 戻り値を捨てていたので、例外にもログにも一切現れなかった。
-- 2026-09-23 の #1135（CHECK を 20 値へ広げる）はこの3本を直していない。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

DO $$
DECLARE
  v_insurer_id uuid;
  v_system_id uuid;
  v_missing int;
  v_extra int;
  v_state text;
  v_policies_not_uid int;
BEGIN
  -- (a) 保険会社ごとにシステム行がちょうど1つ在るか。
  SELECT count(*) INTO v_missing
  FROM public.insurers i
  WHERE NOT EXISTS (SELECT 1 FROM public.insurer_users u WHERE u.insurer_id = i.id AND u.is_system);

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'システム行の無い保険会社が % 社ある。20260924133200 の埋め戻しか挿入トリガが効いていない', v_missing;
  END IF;

  -- 増えた保険会社にトリガが効くか（実際に1社入れて確かめる）。
  INSERT INTO public.insurers (name) VALUES ('検査用ダミー保険会社') RETURNING id INTO v_insurer_id;

  SELECT id INTO v_system_id
  FROM public.insurer_users WHERE insurer_id = v_insurer_id AND is_system;

  IF v_system_id IS NULL THEN
    RAISE EXCEPTION '保険会社を作ってもシステム行が出来ない。trg_insurers_ensure_system_actor が効いていない';
  END IF;

  -- (b) その id で自動処理の監査行が実際に入るか。ここが 23502 で落ちていた。
  BEGIN
    INSERT INTO public.insurer_access_logs (insurer_id, insurer_user_id, action, meta)
    VALUES (v_insurer_id, v_system_id, 'case_summary_auto', '{}'::jsonb);
    v_state := 'INSERTED';
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;

  IF v_state <> 'INSERTED' THEN
    RAISE EXCEPTION '自動処理の監査行がシステム行の id でも入らない（SQLSTATE %）。'
      '23502 なら NOT NULL、23503 なら外部キー、23514 なら action の語彙', v_state;
  END IF;

  -- (c) システム行は user_id を持たない ＝ RLS のどのポリシーにも一致しない。
  --     ポリシーはすべて `user_id = auth.uid()` の等値比較である前提なので、
  --     その前提が崩れていないかもここで見る（`IS NULL` を含む形が現れたら落とす）。
  IF EXISTS (SELECT 1 FROM public.insurer_users WHERE is_system AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'システム行が user_id を持っている。ログイン経路から参照されうる';
  END IF;

  SELECT count(*) INTO v_policies_not_uid
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual, '') LIKE '%insurer_users%' OR coalesce(with_check, '') LIKE '%insurer_users%')
    AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%insurer_users%user_id IS NULL%';

  IF v_policies_not_uid > 0 THEN
    RAISE EXCEPTION
      'insurer_users を参照するポリシーに user_id IS NULL を含むものが % 本ある。'
      'システム行がそのポリシーに一致し、権限を持ってしまう', v_policies_not_uid;
  END IF;

  -- 形の CHECK が効いているか（人なのに user_id 無し、を弾くか）。
  BEGIN
    INSERT INTO public.insurer_users (insurer_id, user_id, role, is_system)
    VALUES (v_insurer_id, NULL, 'viewer', false);
    v_state := 'INSERTED';
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;

  IF v_state <> '23514' THEN
    RAISE EXCEPTION 'user_id の無い「人」の行が入ってしまう（実際: %）。'
      'insurer_users_system_actor_shape_check が効いていない', v_state;
  END IF;

  -- 保険会社あたりシステム行は1つだけ（部分一意索引）。
  BEGIN
    INSERT INTO public.insurer_users (insurer_id, user_id, role, is_system)
    VALUES (v_insurer_id, NULL, 'viewer', true);
    v_state := 'INSERTED';
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;

  IF v_state <> '23505' THEN
    RAISE EXCEPTION 'システム行を2つ作れてしまう（実際: %）。'
      'insurer_users_one_system_per_insurer が効いていない', v_state;
  END IF;

  SELECT count(*) INTO v_extra FROM public.insurer_users WHERE insurer_id = v_insurer_id AND is_system;
  IF v_extra <> 1 THEN
    RAISE EXCEPTION 'システム行が % 行ある（1行のはず）', v_extra;
  END IF;

  RAISE NOTICE 'insurer_users のシステム行: 全社に存在・トリガ有効・自動処理の監査行が通る・権限なし';
END $$;

ROLLBACK;
