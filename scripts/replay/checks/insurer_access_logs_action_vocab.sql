-- `insurer_access_logs.action` の語彙が、アプリが実際に書く 20 種を全部受け取れるかを
-- **1値ずつ insert して**確かめる。
--
-- なぜ要るか: この CHECK が4値しか許さなかったせいで、保険会社ポータルの
-- 車両検索・店舗検索・車両詳細が本番で必ず 500 になっていた（SQL 関数の中の insert が
-- 弾かれ、関数ごと中断していた）。語彙は DB の CHECK にしか書かれておらず、
-- 書き手（TypeScript 12 箇所・RPC 3 箇所・SQL 関数 6 本）は散らばっている。
-- **誰かが CHECK を狭めても広げても、ここが落ちる**（下の (2) で値集合の完全一致を見る）。
-- TypeScript 側の書き手は `src/lib/insurer/auditActions.ts` の型が縛り、
-- その型とこの一覧のずれは `npm run check:audit-actions` が見る。鎖はこうなっている:
--
--   auditActions.ts の型  →(check:audit-actions)→  下の v_actions  →(この検査)→  DB の CHECK
--
-- SQL 関数が新しい `action` を書き始める経路だけは型で縛れないので、
-- (3) で「この表に insert する関数の集合」を既知の6本に固定している（増えたら落ちる）。
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
  v_check_values text[];
  v_expected text[];
  v_writers text[];
  -- この表に insert する public スキーマの関数（2026-09-23 に本番で実測）。
  v_known_writers text[] := ARRAY[
    'insurer_audit_log',
    'insurer_get_certificate',
    'insurer_get_vehicle_certificates',
    'insurer_search_certificates',
    'insurer_search_stores',
    'insurer_search_vehicles'
  ];
BEGIN
  IF coalesce(array_length(v_actions, 1), 0) = 0 THEN
    RAISE EXCEPTION '検査側の語彙一覧が空。この検査は何も確かめていない';
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

  -- (2) CHECK が余分な値を持っていないか（片側だけの包含では、CHECK を広げた
  --     マイグレーションと一覧のずれが通ってしまう）。定義文字列から 'x'::text を拾う。
  SELECT array_agg(m[1] ORDER BY m[1])
    INTO v_check_values
  FROM pg_constraint c,
       LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
  WHERE c.conrelid = 'public.insurer_access_logs'::regclass
    AND c.conname = 'insurer_access_logs_action_check';

  IF v_check_values IS NULL THEN
    RAISE EXCEPTION 'insurer_access_logs_action_check の値を1つも読めなかった。制約が無いか、定義の書式が変わっている';
  END IF;

  SELECT array_agg(x ORDER BY x) INTO v_expected FROM unnest(v_actions) AS x;

  IF v_check_values <> v_expected THEN
    RAISE EXCEPTION
      'CHECK の値集合と検査の一覧が一致しない。CHECK のみ: [%] / 一覧のみ: [%]',
      (SELECT coalesce(string_agg(x, ', '), '') FROM unnest(v_check_values) x WHERE x <> ALL (v_expected)),
      (SELECT coalesce(string_agg(x, ', '), '') FROM unnest(v_expected) x WHERE x <> ALL (v_check_values));
  END IF;

  -- (3) この表に insert する SQL 関数の集合。既知の6本から増えたら、その関数が
  --     書く `action` が語彙に入っているか人が確かめる（許可リスト＝既定で閉じる）。
  SELECT array_agg(p.proname ORDER BY p.proname)
    INTO v_writers
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    -- `%insert into%insurer_access_logs%` だと、本文のどこかに insert があり、
    -- 別のどこかに表名が出てくるだけの関数（コメント内の言及など）にも一致してしまう。
    -- 実際 2026-09-24 に ensure_insurer_system_actor（insurer_users に insert し、
    -- note の文中に insurer_access_logs と書いてある）を誤検知した。隣接を要求する。
    AND p.prosrc ~* 'insert\s+into\s+(public\.)?insurer_access_logs';

  IF v_writers IS DISTINCT FROM v_known_writers THEN
    RAISE EXCEPTION
      'insurer_access_logs に insert する関数が変わった。増えた: [%] / 消えた: [%]。'
      '増えた関数が書く action が % の一覧と CHECK に入っているか確かめること',
      (SELECT coalesce(string_agg(x, ', '), '') FROM unnest(coalesce(v_writers, '{}')) x WHERE x <> ALL (v_known_writers)),
      (SELECT coalesce(string_agg(x, ', '), '') FROM unnest(v_known_writers) x WHERE x <> ALL (coalesce(v_writers, '{}'))),
      'src/lib/insurer/auditActions.ts';
  END IF;

  RAISE NOTICE 'insurer_access_logs.action: % 種すべて通り、語彙外は弾かれ、CHECK の値集合も一致（書き手の関数 % 本）',
    array_length(v_actions, 1), array_length(v_known_writers, 1);
END $$;

ROLLBACK;
