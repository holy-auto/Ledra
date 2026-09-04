-- insurer_accessible_tenant_ids() が本番で常に失敗していたのを直す。
--
-- 20260404000000_fix_security_definer_search_path.sql が
-- `ALTER FUNCTION insurer_accessible_tenant_ids(uuid) SET search_path = ''`
-- を適用したが、関数本体は `FROM insurer_tenant_access` とスキーマ修飾なしのまま
-- だった。search_path が空だと非修飾の識別子は解決できないため、この関数は
-- 呼ばれるたびに `relation "insurer_tenant_access" does not exist` で落ちる。
--
-- 影響: 保険会社ポータルの検索3経路（insurer_search_certificates /
-- insurer_search_stores / insurer_search_vehicles）はいずれもこの関数を呼ぶため、
-- 2026-04-04 以降 HTTP 500 を返していた。
--
-- 後続の 20260802154302 / 20260802154541（fix_search_path_bare_refs_...）は
-- 同種の修正だが、この関数は対象に入っていなかった。
--
-- 変更は参照のスキーマ修飾のみ。シグネチャ・返り値・volatility・SECURITY DEFINER・
-- search_path='' はすべて現行のまま維持する（挙動は変えず、壊れた参照だけを直す）。
-- EXECUTE 権限は postgres / service_role のみで、anon / authenticated には無い。
-- 呼び出し元3本はいずれも auth.uid() から自分の insurer_id を導出して渡すため、
-- この修正で可視範囲は広がらない。
CREATE OR REPLACE FUNCTION public.insurer_accessible_tenant_ids(p_insurer_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT tenant_id
  FROM public.insurer_tenant_access
  WHERE insurer_id = p_insurer_id
    AND is_active = true
    AND revoked_at IS NULL;
$function$;
