-- ヒアリング→顧客連携を1トランザクションにまとめる —— 部分成功を無くす
--
-- ## なぜ要るか
--
-- `src/app/api/admin/hearings/route.ts` の `action: "link_customer"` は3つの書き込みを
-- 別々に投げていた（顧客 insert → 車両 insert → ヒアリング update）。どれが落ちても
-- 残りは残るので、**途中で落ちると宙に浮いた行が残る**。
--
-- 2026-10-10 に握り潰しを直し（DECISION_LOG 2026-10-10）、ヒアリングに
-- `customer_id` が付いていれば顧客を作り直さない形にしたが、
-- **ヒアリング更新そのものが落ちた回だけは `customer_id` を書けない**ので、
-- 押し直すと顧客が二重に増える穴が残っていた（`/code-review` #1306 指摘1）。
-- 名前も電話も空のヒアリングがあり既存顧客を引き当てる鍵が無いため、
-- アプリ側では閉じられない。**代表判断（2026-10-12）で「全部直す」。**
--
-- ## 設計
--
-- **SECURITY INVOKER（既定）。** `security definer` にしない。この関数は
-- `withCaller` が渡すユーザのサーバクライアント（`src/lib/supabase/server.ts`）から
-- 呼ばれるので、INVOKER なら **RLS が今までどおり効く** —— 3表のポリシーは
-- `tenant_memberships` で見ており（`20260322000004_hearings.sql:44-54` ほか）、
-- 関数にしたことでテナント分離が緩むことがない。definer にすると分離を
-- 自前で書き直すことになり、そこが新しい穴になる。
--
-- `set search_path = ''` を付け、表は全て `public.` で修飾する。
--
-- **`for update`** でヒアリング行を取る。同じボタンの二度押し（画面は
-- `status !== 'linked'` の間ボタンを出し続ける）が並行して走っても、
-- 2本目は1本目のコミットを待ってから `customer_id` を見るので顧客が二重に増えない。
--
-- **車両だけは副トランザクション**（`begin ... exception ... end`）に置く。
-- 車両の insert が恒久的な理由（CHECK・一意制約など）で落ちるとき、全体を巻き戻すと
-- **顧客の連携が永久にできなくなる**。顧客とヒアリングは原子的に確定させ、
-- 車両の失敗は `vehicle_error_code`（SQLSTATE）として返して画面に出す。
-- plpgsql の例外ブロックは副トランザクションなので、車両の失敗だけが巻き戻る。
--
-- 返り値は jsonb。`not_found` は「存在しない／他テナント／RLS で見えない」。
--
-- ## 本番で実際に走ること
--
-- **関数の新規作成のみ。** 既存の表・データ・ポリシーは変更しない。
-- 既存行の再検査も走らない。呼び出し元が切り替わるまで（同一 PR のアプリ変更）
-- この関数は誰からも呼ばれない。
--
-- 戻したいときは `drop function public.link_hearing_customer(uuid, uuid);` だが、
-- アプリが呼んでいる間は落とせない。
--
-- 検証: `scripts/replay/checks/link_hearing_customer.sql` が、authenticated に降りた上で
-- (1) 正常系、(2) 二度押しで顧客が増えないこと、(3) ヒアリング更新が落ちたら顧客も
-- 巻き戻ること（原子性）、(4) 車両だけ落ちても顧客とヒアリングは確定すること
-- を行を入れて確かめる。

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
begin
  -- RLS が効いた上で、さらに呼び出し元の active tenant に限定する
  -- （route が `.eq("tenant_id", caller.tenantId)` でやっていたのと同じ絞り込み）。
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

  -- 車両: メーカーか車種のどちらかが入っているときだけ作る（従来と同じ条件）。
  v_vehicle_id := v_hearing.vehicle_id;
  if v_vehicle_id is null
     and (nullif(v_hearing.vehicle_maker, '') is not null or nullif(v_hearing.vehicle_model, '') is not null)
  then
    begin
      insert into public.vehicles (
        tenant_id, maker, model, year, plate_display, vin_code, customer_id, size_class
      )
      values (
        p_tenant_id,
        nullif(v_hearing.vehicle_maker, ''),
        nullif(v_hearing.vehicle_model, ''),
        v_hearing.vehicle_year,
        nullif(v_hearing.vehicle_plate, ''),
        nullif(v_hearing.vehicle_vin, ''),
        v_customer_id,
        nullif(v_hearing.vehicle_size, '')
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

-- 画面（authenticated）から呼ぶ関数なので authenticated には渡す。
-- anon には用が無いので落とす（RLS でも通らないが、呼べる面を残さない）。
revoke execute on function public.link_hearing_customer(uuid, uuid) from public, anon;
grant execute on function public.link_hearing_customer(uuid, uuid) to authenticated, service_role;
