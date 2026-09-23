-- `insurer_access_logs.action` の語彙が、アプリが実際に書く 20 種を全部受け取れるかを
-- **1値ずつ insert して**確かめる。
--
-- なぜ要るか: この CHECK が4値しか許さなかったせいで、保険会社ポータルの
-- 車両検索・店舗検索・車両詳細が本番で必ず 500 になっていた（SQL 関数の中の insert が
-- 弾かれ、関数ごと中断していた）。語彙は DB の CHECK にしか書かれておらず、
-- 書き手（TypeScript 12 箇所・RPC 3 箇所・SQL 関数 6 本）は散らばっている。
-- **誰かが CHECK を狭めたら、ここが落ちる。**
--
-- 検査のしかた: CHECK は行を組み立てる時点で見られ、外部キーのトリガは行が入った
-- **後**に走る。だから存在しない insurer_id でも、値が語彙に在れば 23514 にはならない
-- （外部キー 23503 か、外部キーが無ければ挿入成功）。23514 が返れば語彙から漏れている。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

DO $$
DECLARE
  v_actions text[] := ARRAY[
    'view','search','download_pdf','export_csv',
    'vehicle_search','vehicle_view','store_search',
    'case_create','case_update','case_message','case_bulk_update','case_attachment_upload',
    'case_summary_auto','case_assign_suggest_auto','fraud_check','fraud_check_auto',
    'pii_disclosure_request',
    'insurer.export.csv','insurer.export.csv.one','insurer.export.pdf.one'
  ];
  v_action text;
  v_state text;
  v_rejected text[] := ARRAY[]::text[];
BEGIN
  IF array_length(v_actions, 1) <> 20 THEN
    RAISE EXCEPTION '語彙の件数が 20 ではない（%）。検査側の一覧が崩れている',
      array_length(v_actions, 1);
  END IF;

  FOREACH v_action IN ARRAY v_actions LOOP
    BEGIN
      INSERT INTO public.insurer_access_logs (insurer_id, insurer_user_id, action, meta)
      VALUES (
        '00000000-0000-4000-8000-0000000000f1',
        '00000000-0000-4000-8000-0000000000f2',
        v_action,
        '{}'::jsonb
      );
      v_state := 'INSERTED';
    EXCEPTION WHEN others THEN
      v_state := SQLSTATE;
    END;

    -- 23514 = check_violation。これだけが「語彙から漏れている」を意味する。
    IF v_state = '23514' THEN
      v_rejected := v_rejected || v_action;
    END IF;
  END LOOP;

  IF array_length(v_rejected, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'insurer_access_logs_action_check がアプリの書く値を弾いている: %。'
      'CHECK が狭められたか、語彙に追い付いていない', array_to_string(v_rejected, ', ');
  END IF;

  -- 陰性対照: 語彙に無い値は今も弾かれること（CHECK ごと外れていないか）
  BEGIN
    INSERT INTO public.insurer_access_logs (insurer_id, insurer_user_id, action, meta)
    VALUES (
      '00000000-0000-4000-8000-0000000000f1',
      '00000000-0000-4000-8000-0000000000f2',
      'not_a_real_action_xyz',
      '{}'::jsonb
    );
    v_state := 'INSERTED';
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;

  IF v_state <> '23514' THEN
    RAISE EXCEPTION
      '語彙に無い値が check_violation にならない（実際: %）。'
      'insurer_access_logs_action_check が外れている', v_state;
  END IF;

  RAISE NOTICE 'insurer_access_logs.action: 20 種すべて通り、語彙外は弾かれる';
END $$;

ROLLBACK;
