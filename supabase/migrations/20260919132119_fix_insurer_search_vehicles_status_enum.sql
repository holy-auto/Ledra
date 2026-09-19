-- 本番で insurer_search_vehicles(text,integer,integer,text,text) が全呼び出し落ちていたのを直す。
--
-- 症状: 保険会社ポータルの車両検索 (src/app/api/insurer/vehicles/route.ts) が必ず失敗する。
-- 原因は2つ。どちらも certificates.status の型が本番では enum
-- (certificate_status_enum = active, void, draft) であることに由来する。
--
--   (1) 22P02 — `c.status IN ('active', 'void', 'expired')` の 'expired' は
--       enum に無いので、リテラルの enum への変換自体が実行時に落ちる。
--       再現（本番で実測、副作用なし）:
--         select 1 from public.certificates c
--          where c.status in ('active','void','expired') limit 0;
--         → ERROR 22P02: invalid input value for enum certificate_status_enum: "expired"
--   (2) 42804 — RETURNS TABLE の latest_cert_status は text だが、
--       `(SELECT c2.status ...)` は enum を返すので RETURN QUERY の型が合わない。
--
-- どちらも同じ直し方がこのリポジトリに既にある: 20260329200001（insurer_search_certificates）、
-- 20260802154302 / 20260802154541（platform_certificate_stats, insurer_get_vehicle_certificates）が
-- `status::text` にしている。insurer_search_vehicles だけがその掃除から漏れていた。
-- 本番の全関数を走査して 'expired' を素の status と比べているものを数えたところ、
-- 残っているのはこの1本のみ（ポリシーは0件）。
--
-- なぜ enum に 'expired' を足す方を選ばなかったか: 稼働中の状態語彙を増やす判断は
-- IMP-015 側の話で、この PR の目的（落ちている本番機能の復旧）より広い。
-- `::text` は既存の兄弟関数と同じ形で、enum の本番でも text+check の再生 DB でも動く。
--
-- 挙動の変更は上記2箇所のキャストのみ。シグネチャと RETURNS TABLE は本番の定義
-- （pg_get_functiondef）と同一。search_path だけは本番の
-- `TO 'public', 'extensions'` ではなく `= ''` にし、本体の参照を全て schema 修飾した
-- （lint-migrations の security-definer-mutable-search-path が新規ファイルに要求する形）。
-- 本体は pg_catalog の関数と public のテーブル・auth.uid() しか触らないので、
-- 空 search_path でも解決先は変わらない。
--
-- 適用順: 本番が落ちていたので、このファイルは db-migrate ではなく手で本番に当て済み
-- （supabase_migrations.schema_migrations の 20260919132119 = 適用時刻。ファイル名も
-- それに合わせてあるので、次の `supabase db push` はこの版を再実行しない）。
-- 本番に記録された statements は DDL は下と同一で、コメント冒頭だけ短い。
CREATE OR REPLACE FUNCTION public.insurer_search_vehicles(
  p_query      text DEFAULT ''::text,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0,
  p_ip         text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
)
RETURNS TABLE (
  vehicle_id            uuid,
  maker                 text,
  model                 text,
  year                  integer,
  plate_display         text,
  vin_code              text,
  size_class            text,
  tenant_id             uuid,
  tenant_name           text,
  certificate_count     bigint,
  latest_cert_public_id text,
  latest_cert_status    text,
  latest_cert_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
BEGIN
  SELECT iu.id, iu.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM public.insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  INSERT INTO public.insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, 'vehicle_search',
    jsonb_build_object('query', p_query), p_ip, p_user_agent);

  RETURN QUERY
    SELECT
      v.id AS vehicle_id,
      v.maker, v.model, v.year, v.plate_display, v.vin_code, v.size_class,
      v.tenant_id,
      t.name AS tenant_name,
      count(c.id) AS certificate_count,
      (SELECT c2.public_id FROM public.certificates c2
       WHERE c2.vehicle_id = v.id ORDER BY c2.created_at DESC LIMIT 1) AS latest_cert_public_id,
      (SELECT c2.status::text FROM public.certificates c2
       WHERE c2.vehicle_id = v.id ORDER BY c2.created_at DESC LIMIT 1) AS latest_cert_status,
      (SELECT c2.created_at FROM public.certificates c2
       WHERE c2.vehicle_id = v.id ORDER BY c2.created_at DESC LIMIT 1) AS latest_cert_created_at
    FROM public.vehicles v
    LEFT JOIN public.tenants t ON t.id = v.tenant_id
    LEFT JOIN public.certificates c ON c.vehicle_id = v.id AND c.status::text IN ('active', 'void', 'expired')
    WHERE
      v.tenant_id IN (SELECT public.insurer_accessible_tenant_ids(v_insurer_id))
      AND (
        p_query = ''
        OR coalesce(v.vin_code, '') = p_query
        OR coalesce(v.plate_display, '') ILIKE '%' || p_query || '%'
        OR coalesce(v.maker, '') ILIKE '%' || p_query || '%'
        OR coalesce(v.model, '') ILIKE '%' || p_query || '%'
      )
    GROUP BY v.id, v.maker, v.model, v.year, v.plate_display,
             v.vin_code, v.size_class, v.tenant_id, t.name
    ORDER BY
      CASE WHEN coalesce(v.vin_code, '') = p_query THEN 0 ELSE 1 END,
      max(c.created_at) DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
END;
$$;
