-- `maker` / `model` を省いた車両の insert が通るかを、行を入れて確かめる。
--
-- なぜ要るか: 代表判断（2026-10-02）で「メーカー・車種が分からない車両でも証明書を発行する」
-- と決め、`20261002120100_allow_unknown_vehicle_maker_model.sql` で本番の NOT NULL を外した。
-- 証明書発行は `maker` / `model` に明示 NULL を送りうる（`src/lib/certificates/create.ts:291-292`。
-- ガードは同 197 行で「`vehicle_id` か `maker` か `model` のどれか1つ」）。
--
-- この2列は過去に**両方向へ動いている** —— `20260929150300` が `SET NOT NULL` を宣言し、
-- この版が `DROP NOT NULL` で戻した。次に誰かが「本番に揃える」つもりで NOT NULL を
-- 足し直すと、**片方だけの発行が黙って 23502 で落ちる**。列の名前は変わらないので
-- ドリフト検出器にも映らない。だから行を入れて確かめる。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

INSERT INTO public.tenants (id, name, slug)
VALUES ('00000000-0000-4000-8000-0000000000e1', 'maker-null-check tenant', 'maker-null-check-tenant');

DO $$
DECLARE
  v_maker text;
  v_model text;
BEGIN
  -- maker / model を**省いて**入れる（片方も分からない車両の発行と同じ形）。
  -- insert 後に tenant_id だけが NOT NULL・既定なしで残る想定。
  INSERT INTO public.vehicles (id, tenant_id)
  VALUES ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e1')
  RETURNING maker, model INTO v_maker, v_model;

  -- 「通った」だけでなく、**NULL として入った**ことまで見る。
  -- 既定値が後から足されると（例: 空文字）この検査は insert が通るので素通りしてしまう。
  IF v_maker IS NOT NULL OR v_model IS NOT NULL THEN
    RAISE EXCEPTION
      'maker / model を省いた insert が NULL 以外になった（maker=%, model=%）。'
      '既定値が足された可能性がある。「不明」は NULL で表す判断（DECISION_LOG 2026-10-02）と食い違う',
      coalesce(v_maker, '(NULL)'), coalesce(v_model, '(NULL)');
  END IF;

  RAISE NOTICE 'maker / model を省いた車両の insert が通り、どちらも NULL で入った';
END $$;

-- 陰性対照: この検査が「何も見ていない検査」になっていないことを確かめる。
-- `tenant_id`（NOT NULL・既定なし）を省いた insert は 23502 で落ちなければならない。
-- 落ちなければ、上の insert が通ったのは「vehicles の NOT NULL が全部外れている」等の
-- 別の理由であり、この検査は maker / model について何も言っていない。
DO $$
DECLARE
  v_sqlstate text;
BEGIN
  BEGIN
    INSERT INTO public.vehicles (id, maker, model)
    VALUES ('00000000-0000-4000-8000-0000000000e3', '陰性対照', '陰性対照');
    RAISE EXCEPTION
      '陰性対照が落ちなかった。tenant_id を省いた insert が通っている。'
      'vehicles の NOT NULL が想定より緩い（この検査は maker / model を検証できていない）';
  EXCEPTION
    WHEN not_null_violation THEN
      RAISE NOTICE '陰性対照: tenant_id を省いた insert は 23502 で落ちた（検査は効いている）';
    WHEN others THEN
      v_sqlstate := SQLSTATE;
      -- 23502 以外で落ちた場合は、落ちた理由が違う。黙って成功扱いにしない。
      RAISE EXCEPTION
        '陰性対照が 23502 以外（%）で落ちた。tenant_id の NOT NULL ではない別の理由で'
        '弾かれているので、この検査の前提が崩れている', v_sqlstate;
  END;
END $$;

ROLLBACK;
