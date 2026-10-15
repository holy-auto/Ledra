-- ヒアリング→顧客連携でも、既にある車両を引き当てて1台にまとめる
--
-- ## 代表判断（2026-10-15）: ナンバーも VIN も無い車両は「顧客 + メーカー + 車種」で同一と見なす
--
-- 2026-10-02 に `vehicles.maker` / `model` の NOT NULL を外し、**片方だけでも発行できる**ように
-- したとき、`/code-review` が「ナンバーが無いと重複排除が働かず、同じ車に2回発行すると
-- `vehicles` に2行できる」ことを指摘した（OPEN_QUESTIONS に4択で起票）。
-- 代表判断は **(b) `maker` + `model` + 顧客で照合する**。
-- 同じ顧客が同車種を2台持っていれば統合される —— **承知の上の判断**で、
-- 走行距離・車両パスポートの時系列が車両ごとに分かれるより1台に寄せる方を採った。
--
-- この関数（`20261015122028` で作った1トランザクションの連携）は、**照合を一切せず常に
-- insert していた**。ヒアリングを2回取れば顧客1人に同じ車が2行できる。
-- アプリ側の発行経路（`src/lib/vehicles/resolveExistingVehicle.ts`）と同じ規則を入れる。
--
-- ## 順番（上から順に、当たったところで止まる）
--
--   1. **ナンバー**（`plate_display`）—— テナント内でほぼ一意
--   2. **VIN** —— 正規化キー `vehicles.vin_code_normalized`（トリガが `vin_code` から維持。
--      `20260825000000`）を `public.vin_normalize()` で引く。保存側と照合側で同じ関数を通す
--   3. **顧客 + メーカー + 車種** —— ナンバーも VIN も**どちらも無い**ときだけ
--
-- 3 をナンバー・VIN があるときにも効かせてはいけない。ナンバーで引けなかったのは
-- 「そのナンバーの車がまだ無い」ことなので、別の行に寄せると**違う車に紐付く**。
-- メーカー・車種は**値の一致**で見る（片方が未入力なら未入力同士で一致。`is not distinct from`）。
--
-- ## アプリ側の双子
--
-- `src/lib/vehicles/resolveExistingVehicle.ts` が同じ規則を TypeScript で持つ。
-- **どちらかを変えたら両方変える。** `normalizeVin()` ↔ `vin_normalize()` と同じ約束で、
-- 片方だけ直すと経路によって同一性の判定が変わる。
--
-- ## 本番で実際に変わること
--
-- 関数の置き換えのみ（既存の表・データ・ポリシーは変更しない）。
-- 既に作られてしまった重複行はこの変更では**統合しない** —— 行の統合は証明書・パスポートの
-- 参照先を書き換える操作で、別の判断が要る。ここから先の連携で増えないようにするだけ。
--
-- 検証: `scripts/replay/checks/link_hearing_customer.sql` が、ナンバー一致・VIN 一致・
-- 顧客+メーカー+車種の一致でそれぞれ既存の車両に紐付くこと、ナンバーが違えば紐付かないことを
-- 行を入れて確かめる。

create or replace function public.link_hearing_customer(p_hearing_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hearing public.hearings;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_vehicle_error text := null;
  v_plate text;
  v_vin text;
  v_maker text;
  v_model text;
begin
  -- RLS が効いた上で、さらに呼び出し元の active tenant に限定する。
  select * into v_hearing
  from public.hearings
  where id = p_hearing_id and tenant_id = p_tenant_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- 顧客: 既に付いているなら作り直さない（二度押し）。
  v_customer_id := v_hearing.customer_id;
  if v_customer_id is null then
    insert into public.customers (tenant_id, name, email, phone)
    values (
      p_tenant_id,
      coalesce(nullif(v_hearing.customer_name, ''), '未入力'),
      nullif(v_hearing.customer_email, ''),
      nullif(v_hearing.customer_phone, '')
    )
    returning id into v_customer_id;
  end if;

  -- 車両: メーカーか車種のどちらかが入っているときだけ扱う（従来と同じ条件）。
  v_vehicle_id := v_hearing.vehicle_id;
  v_plate := nullif(btrim(v_hearing.vehicle_plate), '');
  v_vin   := nullif(btrim(v_hearing.vehicle_vin), '');
  v_maker := nullif(btrim(v_hearing.vehicle_maker), '');
  v_model := nullif(btrim(v_hearing.vehicle_model), '');

  if v_vehicle_id is null and (v_maker is not null or v_model is not null) then
    -- ① ナンバー
    if v_plate is not null then
      select id into v_vehicle_id
      from public.vehicles
      where tenant_id = p_tenant_id and plate_display = v_plate
      limit 1;
    end if;

    -- ② VIN（正規化キー）
    if v_vehicle_id is null and v_vin is not null then
      select id into v_vehicle_id
      from public.vehicles
      where tenant_id = p_tenant_id
        and vin_code_normalized is not null
        and vin_code_normalized = public.vin_normalize(v_vin)
      limit 1;
    end if;

    -- ③ 顧客 + メーカー + 車種（ナンバーも VIN も無いときだけ・代表判断 b）
    if v_vehicle_id is null and v_plate is null and v_vin is null then
      select id into v_vehicle_id
      from public.vehicles
      where tenant_id = p_tenant_id
        and customer_id = v_customer_id
        and maker is not distinct from v_maker
        and model is not distinct from v_model
      order by created_at desc
      limit 1;
    end if;
  end if;

  -- どれにも当たらなければ作る。
  if v_vehicle_id is null and (v_maker is not null or v_model is not null) then
    begin
      insert into public.vehicles (
        tenant_id, maker, model, year, plate_display, vin_code, customer_id, size_class
      )
      values (
        p_tenant_id, v_maker, v_model, v_hearing.vehicle_year, v_plate, v_vin,
        v_customer_id, nullif(btrim(v_hearing.vehicle_size), '')
      )
      returning id into v_vehicle_id;
    exception when others then
      -- **ここだけ本処理を止めない。** 車両が作れないことで顧客の連携まで
      -- 永久に止めると、現場は代わりの手段を持たない。SQLSTATE を返して画面に出す。
      v_vehicle_error := sqlstate;
      v_vehicle_id := null;
    end;
  end if;

  update public.hearings
  set customer_id = v_customer_id,
      vehicle_id = v_vehicle_id,
      status = 'linked',
      updated_at = now()
  where id = p_hearing_id and tenant_id = p_tenant_id;

  return jsonb_build_object(
    'ok', true,
    'customer_id', v_customer_id,
    'vehicle_id', v_vehicle_id,
    'vehicle_error_code', v_vehicle_error
  );
end;
$$;

-- 画面（authenticated）から呼ぶ関数。anon には用が無いので落とす。
revoke execute on function public.link_hearing_customer(uuid, uuid) from public, anon;
grant execute on function public.link_hearing_customer(uuid, uuid) to authenticated, service_role;
