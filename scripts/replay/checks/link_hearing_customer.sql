-- `public.link_hearing_customer` が「全部か、何も残らないか」になっているかを、行を入れて確かめる。
--
-- なぜ要るか: この関数は**部分成功を無くすため**に入れた
-- （`20261015122028_link_hearing_customer_transaction.sql`、DECISION_LOG 2026-10-12）。
-- 守るべき性質は4つあり、どれも**型も構文も通ったまま壊れる**。
--
--   1. 正常系: 顧客・車両が作られ、ヒアリングが linked になる
--   2. 二度押しで顧客が増えない（`for update` と `customer_id is null` の両方が要る）
--   3. **原子性**: ヒアリング更新が落ちたら顧客も残らない
--      —— `security definer` に変えたり、関数の外に出したりすると最初に壊れる
--   4. 車両だけの失敗は本処理を止めない（副トランザクションの `exception` 節）
--      —— ここを消すと、車両の CHECK 違反1つで顧客の連携が永久にできなくなる
--   5. **既にある車両を引き当てる**（代表判断 2026-10-15・選択肢 b）: ナンバー → VIN →
--      顧客+メーカー+車種。緩むと**違う車に紐付き**、きつくなると同じ車の行が増える。
--      アプリ側の双子は `src/lib/vehicles/resolveExistingVehicle.ts`
--
-- 3 と 4 は「落ちたときどうなるか」なので、トリガで**実際に落として**確かめる。
--
-- RLS は表の所有者と superuser には効かない。関数は SECURITY INVOKER なので、
-- 呼ぶときは必ず authenticated に降りる（降りないと RLS を通る経路を検査できない）。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

-- auth.uid() は request.jwt.claim.sub を読む（scripts/replay/bootstrap.sql）。
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f001', true);

INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-00000000f001');

INSERT INTO public.tenants (id, name, slug)
VALUES ('00000000-0000-4000-8000-0000000000f1', 'link-hearing tenant', 'link-hearing-tenant');

-- **role を省かない。** 既定は `viewer`（`20260702155034_tenant_membership_role_default.sql`
-- でフェイルオープン対策として admin から下げた）で、`customers` / `vehicles` の INSERT は
-- `my_tenant_role(tenant_id) in ('owner','admin','staff')` を要求する
-- （`20260323020000_rls_role_constraints.sql` の `_apply_standard_rls`）。
-- 省くと「関数が壊れている」ように見える RLS 違反が出る（実際に1回出した）。
INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
VALUES ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000f001', 'admin');

-- 閲覧者（viewer）。この関数を通しても顧客を作れないことを下で確かめる。
INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-00000000f002');
INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
VALUES ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000f002', 'viewer');

-- 3件のヒアリング: 正常系／原子性／車両失敗 で1件ずつ使う。
INSERT INTO public.hearings (id, tenant_id, customer_name, vehicle_maker, vehicle_model) VALUES
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f1', '山田', 'トヨタ', 'ハイエース'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f1', '佐藤', 'ホンダ', 'N-BOX'),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f1', '鈴木', 'スズキ', 'ジムニー');

-- 既存車両の引き当て用。f6: ナンバー一致／f7: VIN 一致／f8: 顧客+メーカー+車種／f9: ナンバー違い。
INSERT INTO public.hearings (id, tenant_id, customer_name, vehicle_maker, vehicle_model, vehicle_plate, vehicle_vin) VALUES
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000f1', '田中', 'トヨタ', 'プリウス', '品川300あ1234', ''),
  ('00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-0000000000f1', '伊藤', 'トヨタ', 'プリウス', '', 'zvw30-abc 1234'),
  ('00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000000f1', '渡辺', 'ホンダ', 'フィット', '', ''),
  ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000f1', '山本', 'トヨタ', 'プリウス', '品川300あ9999', '');

-- 引き当て先。plate / VIN を持つ1台（VIN はトリガが正規化キーを埋める）。
INSERT INTO public.vehicles (id, tenant_id, maker, model, plate_display, vin_code)
VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000f1',
        'トヨタ', 'プリウス', '品川300あ1234', 'ZVW30ABC1234');

-- f9（ナンバー違い）の顧客には、**同じメーカー・車種の車を1台持たせておく**。
-- これが無いと、③ のガード（ナンバー・VIN があるときは顧客+メーカー+車種に落ちない）を
-- 外しても寄せる先が無く、検査が素通りする —— 実際に1回見逃した。
INSERT INTO public.customers (id, tenant_id, name)
VALUES ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000f1', '山本');
INSERT INTO public.vehicles (id, tenant_id, customer_id, maker, model)
VALUES ('00000000-0000-4000-8000-0000000000d9', '00000000-0000-4000-8000-0000000000f1',
        '00000000-0000-4000-8000-0000000000c9', 'トヨタ', 'プリウス');
UPDATE public.hearings SET customer_id = '00000000-0000-4000-8000-0000000000c9'
 WHERE id = '00000000-0000-4000-8000-0000000000f9';

-- 落とすためのトリガ。所有者権限が要るので authenticated に降りる前に作る。
CREATE OR REPLACE FUNCTION public.__replay_raise_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay: 意図的に落とす (%)', TG_TABLE_NAME;
END;
$$;

DO $$
DECLARE
  v_res jsonb;
  v_customer_id uuid;
  v_again uuid;
  v_status text;
  n_cust integer;
  n_veh integer;
  v_state text;
  v_reuse_id uuid;
  v_reuse_cust uuid;
BEGIN
  -- ── 1. 正常系 ──────────────────────────────────────────────
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';

  IF coalesce((v_res->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '正常系が ok を返さなかった: %', v_res;
  END IF;
  v_customer_id := (v_res->>'customer_id')::uuid;
  IF v_customer_id IS NULL OR (v_res->>'vehicle_id') IS NULL THEN
    RAISE EXCEPTION '正常系で顧客か車両が作られていない: %', v_res;
  END IF;
  IF v_res->>'vehicle_error_code' IS NOT NULL THEN
    RAISE EXCEPTION '正常系で vehicle_error_code が付いた: %', v_res;
  END IF;

  SELECT status INTO v_status FROM public.hearings WHERE id = '00000000-0000-4000-8000-0000000000f2';
  IF v_status <> 'linked' THEN
    RAISE EXCEPTION 'ヒアリングが linked になっていない（%）。status の語彙と CHECK がずれている可能性', v_status;
  END IF;

  -- ── 2. 二度押しで顧客が増えない ────────────────────────────
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  v_again := (v_res->>'customer_id')::uuid;

  -- c9 は「既存車両の引き当て」用に最初から入れてある顧客なので、以降の件数から除く
  -- （d1 / d9 を車両の件数から除くのと同じ理由）。
  SELECT count(*) INTO n_cust FROM public.customers
   WHERE tenant_id = '00000000-0000-4000-8000-0000000000f1'
     AND id <> '00000000-0000-4000-8000-0000000000c9';
  IF v_again <> v_customer_id OR n_cust <> 1 THEN
    RAISE EXCEPTION
      '二度押しで顧客が増えた（1回目 % / 2回目 % / 顧客 % 件）。`customer_id is null` の分岐が効いていない',
      v_customer_id, v_again, n_cust;
  END IF;

  -- ── 3. 原子性: ヒアリング更新が落ちたら顧客も残らない ──────
  CREATE TRIGGER __replay_block_hearing_update
    BEFORE UPDATE ON public.hearings
    FOR EACH ROW EXECUTE FUNCTION public.__replay_raise_trigger();

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT public.link_hearing_customer(
      '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f1'
    ) INTO v_res;
    v_state := 'RETURNED';
  EXCEPTION WHEN others THEN
    v_state := 'RAISED';
  END;
  EXECUTE 'RESET ROLE';
  DROP TRIGGER __replay_block_hearing_update ON public.hearings;

  IF v_state <> 'RAISED' THEN
    RAISE EXCEPTION
      'ヒアリング更新を落としたのに関数が返ってきた（%）。更新の失敗を飲み込んでいる', v_state;
  END IF;

  -- **ここが原子性の本体。** 顧客が1件のまま（＝佐藤の分が巻き戻った）であること。
  SELECT count(*) INTO n_cust FROM public.customers
   WHERE tenant_id = '00000000-0000-4000-8000-0000000000f1'
     AND id <> '00000000-0000-4000-8000-0000000000c9';
  IF n_cust <> 1 THEN
    RAISE EXCEPTION
      'ヒアリング更新が落ちたのに顧客が % 件残った（期待 1）。1トランザクションになっていない',
      n_cust;
  END IF;

  -- ── 4. 車両だけ落ちても顧客とヒアリングは確定する ──────────
  CREATE TRIGGER __replay_block_vehicle_insert
    BEFORE INSERT ON public.vehicles
    FOR EACH ROW EXECUTE FUNCTION public.__replay_raise_trigger();

  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  DROP TRIGGER __replay_block_vehicle_insert ON public.vehicles;

  IF coalesce((v_res->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION
      '車両が落ちたら全体が失敗になった: %。これでは車両の恒久的な失敗で顧客の連携が永久にできない', v_res;
  END IF;
  IF (v_res->>'vehicle_id') IS NOT NULL OR v_res->>'vehicle_error_code' IS NULL THEN
    RAISE EXCEPTION '車両の失敗が返り値に出ていない: %', v_res;
  END IF;

  SELECT status INTO v_status FROM public.hearings WHERE id = '00000000-0000-4000-8000-0000000000f4';
  SELECT count(*) INTO n_cust FROM public.customers
   WHERE tenant_id = '00000000-0000-4000-8000-0000000000f1'
     AND id <> '00000000-0000-4000-8000-0000000000c9';
  -- d1 / d9 は「既存車両の引き当て」用に最初から入れてある2台なので数えない。
  SELECT count(*) INTO n_veh  FROM public.vehicles
   WHERE tenant_id = '00000000-0000-4000-8000-0000000000f1'
     AND id NOT IN ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d9');
  IF v_status <> 'linked' OR n_cust <> 2 OR n_veh <> 1 THEN
    RAISE EXCEPTION
      '車両だけの失敗で顧客・ヒアリングまで巻き戻った（status=% 顧客=% 車両=%、期待 linked/2/1）',
      v_status, n_cust, n_veh;
  END IF;

  -- ── 5. 閲覧者は連携できない（関数にしても RLS が効いている）────────
  -- SECURITY DEFINER にすると、ここが黙って通るようになる。
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f002', true);
  INSERT INTO public.hearings (id, tenant_id, customer_name, vehicle_maker)
  VALUES ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000f1', '高橋', 'マツダ');

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT public.link_hearing_customer(
      '00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000f1'
    ) INTO v_res;
    v_state := 'RETURNED';
  EXCEPTION WHEN others THEN
    v_state := sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f001', true);

  -- viewer は customers の INSERT ポリシーを満たさないので 42501 で落ちる。
  IF v_state <> '42501' THEN
    RAISE EXCEPTION
      '閲覧者の連携が RLS で止まらなかった（state=% 返り値=%）。関数経由でテナント内の権限が抜けている',
      v_state, v_res;
  END IF;
  SELECT count(*) INTO n_cust FROM public.customers
   WHERE tenant_id = '00000000-0000-4000-8000-0000000000f1'
     AND id <> '00000000-0000-4000-8000-0000000000c9';
  IF n_cust <> 2 THEN
    RAISE EXCEPTION '閲覧者の試行で顧客が % 件に増えた（期待 2）', n_cust;
  END IF;

  -- ── 6. 既にある車両を引き当てる（代表判断 2026-10-15・選択肢 b）──────
  -- ① ナンバー一致 → d1 に紐付く（新規作成しない）
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  IF (v_res->>'vehicle_id')::uuid <> '00000000-0000-4000-8000-0000000000d1' THEN
    RAISE EXCEPTION 'ナンバー一致で既存車両に紐付かなかった: %', v_res;
  END IF;
  -- 引き当てた車両（d1 は顧客なしで入れてある）に顧客が付くこと。
  -- 付かないと、同じ顧客の次の「ナンバーも VIN も無い」連携で ③ が当たらず行が増える。
  SELECT customer_id INTO v_reuse_cust
   FROM public.vehicles WHERE id = '00000000-0000-4000-8000-0000000000d1';
  IF v_reuse_cust IS DISTINCT FROM (v_res->>'customer_id')::uuid THEN
    RAISE EXCEPTION
      '引き当てた車両に顧客が付かなかった（車両の顧客=% / 連携の顧客=%）。次回の ③ が当たらない',
      v_reuse_cust, v_res->>'customer_id';
  END IF;

  -- ② VIN 一致（全角・小文字・ハイフン入りでも正規化して当たる）
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  IF (v_res->>'vehicle_id')::uuid <> '00000000-0000-4000-8000-0000000000d1' THEN
    RAISE EXCEPTION 'VIN 一致で既存車両に紐付かなかった（正規化していない可能性）: %', v_res;
  END IF;

  -- ③ ナンバーも VIN も無い → 顧客 + メーカー + 車種。1回目で作った車両に2回目が寄る。
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  v_reuse_id := (v_res->>'vehicle_id')::uuid;
  v_customer_id := (v_res->>'customer_id')::uuid;
  IF v_reuse_id IS NULL THEN
    RAISE EXCEPTION 'ナンバーも VIN も無い連携で車両が作られなかった: %', v_res;
  END IF;
  -- 同じ顧客・同じメーカー・車種で2件目のヒアリング（連携をもう一度通す）。
  INSERT INTO public.hearings (id, tenant_id, customer_id, customer_name, vehicle_maker, vehicle_model)
  VALUES ('00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-0000000000f1',
          v_customer_id, '渡辺', 'ホンダ', 'フィット');
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  IF (v_res->>'vehicle_id')::uuid <> v_reuse_id THEN
    RAISE EXCEPTION
      '顧客+メーカー+車種で既存車両に寄らなかった（1回目 % / 2回目 %）。同じ車の行が増える',
      v_reuse_id, v_res->>'vehicle_id';
  END IF;

  -- ④ ナンバーが違えば寄らない。**ここが緩むと違う車に紐付く。**
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  -- d9 はこの顧客が持つ同じメーカー・車種の車。ナンバーが違うのでここに寄ってはいけない。
  IF (v_res->>'vehicle_id')::uuid IN (
       '00000000-0000-4000-8000-0000000000d1',
       '00000000-0000-4000-8000-0000000000d9'
     ) THEN
    RAISE EXCEPTION
      'ナンバーが違うのに既存車両（同じメーカー・車種）に紐付いた: %。違う車に紐付く', v_res;
  END IF;

  -- ⑤ 同じ顧客でも**車種が違えば寄らない**。メーカーだけで寄せると
  --    「ホンダ・フィット」に「ホンダ・ステップワゴン」が吸われる。
  INSERT INTO public.hearings (id, tenant_id, customer_id, customer_name, vehicle_maker, vehicle_model)
  VALUES ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-0000000000f1',
          v_customer_id, '渡辺', 'ホンダ', 'ステップワゴン');
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  IF (v_res->>'vehicle_id')::uuid = v_reuse_id THEN
    RAISE EXCEPTION
      '車種が違うのに同じ車両に寄った（% ）。メーカーだけで照合している', v_res;
  END IF;

  -- ⑥ **別の顧客の同じメーカー・車種には寄らない**（他人の車に紐付く）。
  INSERT INTO public.hearings (id, tenant_id, customer_id, customer_name, vehicle_maker, vehicle_model)
  VALUES ('00000000-0000-4000-8000-0000000000fc', '00000000-0000-4000-8000-0000000000f1',
          '00000000-0000-4000-8000-0000000000c9', '山本', 'ホンダ', 'フィット');
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000fc', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  IF (v_res->>'vehicle_id')::uuid = v_reuse_id THEN
    RAISE EXCEPTION
      '別の顧客の車両に寄った（%）。customer_id の条件が効いていない', v_res;
  END IF;

  -- ⑦ ナンバーが一致しても **VIN が食い違う行には寄らない**。
  --    ナンバーは希望番号の再割当・再交付で別の車に回る。VIN の方が車に近い。
  INSERT INTO public.hearings (id, tenant_id, customer_name, vehicle_maker, vehicle_model, vehicle_plate, vehicle_vin)
  VALUES ('00000000-0000-4000-8000-0000000000fd', '00000000-0000-4000-8000-0000000000f1',
          '中村', 'トヨタ', 'プリウス', '品川300あ1234', 'OTHERVIN9999');
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000fd', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  IF (v_res->>'vehicle_id')::uuid = '00000000-0000-4000-8000-0000000000d1' THEN
    RAISE EXCEPTION
      'ナンバーは同じだが VIN が違う車に紐付いた: %。違う車に紐付く', v_res;
  END IF;

  -- ⑧ 前後の空白は JS の `.trim()` と同じ範囲で落とす（全角スペース・タブ・改行）。
  --    `btrim(x)` は半角スペースだけなので、落とす文字を明示しないとここで寄らなくなる。
  INSERT INTO public.hearings (id, tenant_id, customer_name, vehicle_maker, vehicle_model, vehicle_plate)
  VALUES ('00000000-0000-4000-8000-0000000000fe', '00000000-0000-4000-8000-0000000000f1',
          '小林', 'トヨタ', 'プリウス', E'\u3000\t品川300あ1234\n');
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.link_hearing_customer(
    '00000000-0000-4000-8000-0000000000fe', '00000000-0000-4000-8000-0000000000f1'
  ) INTO v_res;
  EXECUTE 'RESET ROLE';
  IF (v_res->>'vehicle_id')::uuid <> '00000000-0000-4000-8000-0000000000d1' THEN
    RAISE EXCEPTION
      '全角スペース・タブ・改行つきのナンバーで既存車両に寄らなかった: %。btrim の文字集合がアプリ側の trim() と違う', v_res;
  END IF;

  RAISE NOTICE 'link_hearing_customer: 正常系・二度押し・原子性・車両だけの失敗・閲覧者の遮断・既存車両の引き当て、6つとも期待どおり';
END $$;

ROLLBACK;
