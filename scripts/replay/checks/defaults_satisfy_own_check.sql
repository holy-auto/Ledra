-- すべての列について「既定値が、その列に張られた CHECK を満たすか」を実際に評価する。
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
-- 代わりに **Postgres 自身を判定器にする**: 同じ型・同じ既定・同じ CHECK を持つ一時テーブルを
-- 1列だけ作り、`INSERT DEFAULT VALUES` して 23514 が出るかを見る。
-- 対象は「CHECK が参照する列がちょうど1つ」かつ「その列に既定値がある」組み合わせ。
-- `NOT VALID` は既存行を検査しないだけで insert は検査されるので、末尾を落として同じに扱う。
--
-- 評価不能（probe を作れない）件数も数え、0 でなければ落とす。
-- **「違反0」を「全部見た」と読み替えないため。** 見られなかった組があるなら、
-- この検査は「該当なし」ではなく「分からない」を返すべきである。
--
-- DB には何も残らない（一時テーブルのみ）。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

DO $$
DECLARE
  r record;
  v_bad text := '';
  v_skip text := '';
  n_ok int := 0; n_bad int := 0; n_skip int := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, a.attname AS col,
           format_type(a.atttypid, a.atttypmod) AS typ,
           pg_get_expr(ad.adbin, ad.adrelid) AS def,
           regexp_replace(pg_get_constraintdef(con.oid), '\s+NOT VALID$', '') AS chk
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1]
    JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public' AND con.contype = 'c'
      AND cardinality(con.conkey) = 1 AND c.relkind = 'r'
    ORDER BY 1, 2
  LOOP
    BEGIN
      EXECUTE 'DROP TABLE IF EXISTS pg_temp.dflt_probe';
      EXECUTE format('CREATE TEMP TABLE dflt_probe (%I %s DEFAULT %s, CONSTRAINT probe_chk %s)',
                     r.col, r.typ, r.def, r.chk);
      BEGIN
        EXECUTE 'INSERT INTO pg_temp.dflt_probe DEFAULT VALUES';
        n_ok := n_ok + 1;
      EXCEPTION WHEN check_violation THEN
        n_bad := n_bad + 1;
        v_bad := v_bad || '  - ' || r.tbl || '.' || r.col
                       || ' 既定=' || r.def || ' / ' || r.chk || chr(10);
      WHEN others THEN
        n_skip := n_skip + 1;
        v_skip := v_skip || '  - ' || r.tbl || '.' || r.col || ' (' || SQLSTATE || ')' || chr(10);
      END;
    EXCEPTION WHEN others THEN
      n_skip := n_skip + 1;
      v_skip := v_skip || '  - ' || r.tbl || '.' || r.col
                       || ' [probe を作れない ' || SQLSTATE || ']' || chr(10);
    END;
  END LOOP;

  EXECUTE 'DROP TABLE IF EXISTS pg_temp.dflt_probe';

  IF n_bad > 0 THEN
    RAISE EXCEPTION E'既定値が自分の表の CHECK に弾かれる列が % 件ある。'
      '省いて insert すると必ず 23514 になる:\n%'
      '（直す向きは CHECK が決める。CHECK が許す値のうち最も弱い/最初の値を既定にする）',
      n_bad, v_bad;
  END IF;

  IF n_skip > 0 THEN
    RAISE EXCEPTION E'評価できなかった組が % 件ある。'
      '「違反0」を「全部見た」と読めないので落とす:\n%', n_skip, v_skip;
  END IF;

  RAISE NOTICE '既定値と CHECK: % 組すべてで既定値が CHECK を満たす（評価不能 0）', n_ok;
END $$;
