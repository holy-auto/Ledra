-- すべての CHECK 制約について「既定値だけで行を作ったら、その CHECK を満たすか」を実際に評価する。
--
-- なぜ要るか
-- ----------
-- 既定値と CHECK は別々に書かれるので、**自分の既定値が自分の CHECK に弾かれる**列が作れる。
-- その列は「省いて insert すると必ず 23514」になり、既定値が一度も使えない。
-- 名前や定義文を読むだけの検査には映らない（どちらも単体では正しい）。
--
-- これまでに3件出ている:
--   - `certificate_images.file_size`  既定 0 / CHECK (file_size > 0)      2026-09-22 (#1124)
--   - `job_orders.status`            既定 'open' / CHECK に 'open' が無い  2026-09-27 (本番で実測)
--   - `insurer_users.role`           既定 'member' / CHECK に 'member' が無い 2026-09-27 (同上)
--
-- どう評価するか
-- --------------
-- 定義文を正規表現で読んで判定しない（`'admin'` が `'super_admin'` に含まれる類の取りこぼしが出る）。
-- 代わりに **Postgres 自身を判定器にする**: CHECK が参照する列だけを持つ一時テーブルを作り、
-- 同じ型・同じ既定・同じ CHECK を付けて `INSERT DEFAULT VALUES` し、23514 が出るかを見る。
-- `NOT VALID` は既存行を検査しないだけで insert は検査されるので、末尾を落として同じに扱う。
--
-- 何を見て、何を見ていないか（ここを曖昧にしない）
-- ------------------------------------------------
-- 2026-09-27 の初版は `cardinality(conkey) = 1` で**複数列の CHECK を母集団から落としており**、
-- 落としたことを「評価不能」にも数えていなかった。つまり **「評価不能 0」が嘘だった**
-- （`/code-review` の指摘。MISTAKE_LEDGER `M-20260927-said-evaluated-all-while-filtering-the-population`）。
-- 今は全 CHECK を母集団にし、次の3つに必ず分類して件数を出す。
--
--   (1) 評価した        …… 参照するすべての列に既定値がある（複数列でも probe を作る）
--   (2) 対象外（明示）  …… 参照する列のどれかに既定値が無い ＝ その列は NULL になり CHECK は
--                          真偽不定で通るので「既定値が弾かれる」状態になり得ない。
--                          件数と列名を出す。**黙って落とさない。**
--   (3) 評価不能        …… probe を作れなかった。**1件でもあれば落とす。**
--
-- `nextval(...)` を既定に持つ列は (2) 扱いにする。`INSERT DEFAULT VALUES` が本物の
-- シーケンスを進めてしまい「DB には何も残らない」が崩れるため（同じ指摘）。
--
-- 一時テーブル以外には何も作らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

DO $$
DECLARE
  r record;
  v_cols text;
  v_bad text := '';
  v_out text := '';
  v_skip text := '';
  n_ok int := 0; n_bad int := 0; n_out int := 0; n_skip int := 0; n_total int := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl,
           regexp_replace(pg_get_constraintdef(con.oid), '\s+NOT VALID$', '') AS chk,
           con.conname,
           -- 参照する列の (名前, 型, 既定値)。既定が無い列は has_default = false。
           array_agg(a.attname ORDER BY a.attnum) AS colnames,
           array_agg(format('%I %s DEFAULT %s', a.attname,
                            format_type(a.atttypid, a.atttypmod),
                            pg_get_expr(ad.adbin, ad.adrelid)) ORDER BY a.attnum)
             FILTER (WHERE ad.adbin IS NOT NULL) AS coldefs,
           bool_and(ad.adbin IS NOT NULL) AS all_have_default,
           bool_or(pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval(%') AS any_nextval
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
    LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public' AND con.contype = 'c' AND c.relkind = 'r'
    GROUP BY c.relname, con.conname, con.oid
    ORDER BY 1, 2
  LOOP
    n_total := n_total + 1;

    IF NOT r.all_have_default OR r.any_nextval THEN
      n_out := n_out + 1;
      v_out := v_out || '  - ' || r.tbl || ' (' || array_to_string(r.colnames, ', ') || ')'
                     || CASE WHEN r.any_nextval THEN ' [nextval]' ELSE ' [既定値の無い列を含む]' END
                     || chr(10);
      CONTINUE;
    END IF;

    v_cols := array_to_string(r.coldefs, ', ');
    BEGIN
      EXECUTE 'DROP TABLE IF EXISTS pg_temp.dflt_probe';
      EXECUTE format('CREATE TEMP TABLE dflt_probe (%s, CONSTRAINT probe_chk %s)', v_cols, r.chk);
      BEGIN
        EXECUTE 'INSERT INTO pg_temp.dflt_probe DEFAULT VALUES';
        n_ok := n_ok + 1;
      EXCEPTION WHEN check_violation THEN
        n_bad := n_bad + 1;
        v_bad := v_bad || '  - ' || r.tbl || ' (' || array_to_string(r.colnames, ', ') || ')' || chr(10)
                       || '      既定: ' || v_cols || chr(10)
                       || '      CHECK: ' || r.chk || chr(10);
      WHEN others THEN
        n_skip := n_skip + 1;
        v_skip := v_skip || '  - ' || r.tbl || '.' || r.conname || ' (insert 時 ' || SQLSTATE || ')' || chr(10);
      END;
    EXCEPTION WHEN others THEN
      n_skip := n_skip + 1;
      v_skip := v_skip || '  - ' || r.tbl || '.' || r.conname
                       || ' [probe を作れない ' || SQLSTATE || ']' || chr(10);
    END;
  END LOOP;

  EXECUTE 'DROP TABLE IF EXISTS pg_temp.dflt_probe';

  IF n_bad > 0 THEN
    RAISE EXCEPTION E'既定値だけで行を作ると自分の CHECK に弾かれる組が % 件ある。'
      '該当列を省いて insert すると必ず 23514 になる:\n%'
      '（直す向きは CHECK が決める。CHECK が許す値のうち最も弱い/最初の値を既定にする）',
      n_bad, v_bad;
  END IF;

  IF n_skip > 0 THEN
    RAISE EXCEPTION E'評価できなかった CHECK が % 件ある。'
      '「違反0」を「全部見た」と読めないので落とす:\n%', n_skip, v_skip;
  END IF;

  RAISE NOTICE '既定値と CHECK: 全 % 件のうち % 件を評価して違反0・評価不能0。対象外 % 件（下記）%',
    n_total, n_ok, n_out, chr(10) || v_out;
END $$;
