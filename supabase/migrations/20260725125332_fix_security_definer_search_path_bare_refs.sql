-- =============================================================================
-- SECURITY DEFINER 関数の search_path 修復（無修飾テーブル参照の解決）
--
-- 次の関数は `SET search_path TO ''` で作られているのに、本文が無修飾の relation
-- （tenants / certificates / vehicles / insurer_users ...）を参照している。空の
-- search_path では無修飾名が解決できず、呼ぶたびに `relation "..." does not exist`
-- を投げる。本番では `relation "tenants" does not exist` が再発しており、これは
-- platform_regional_stats / platform_tenant_category_stats（参照が tenants 単独）が発生源。
-- insurer_* ポータル検索関数も同じ潜在バグ（呼ばれた瞬間に 500）。
--
-- 非破壊・最小修正: 明示的で空でない search_path を固定して既存本文を解決させる。
-- 本文は書き換えない（ロジック回帰リスクなし）。search_path は明示的（mutable でない）
-- ままなのでセキュリティアドバイザの後退はなく、shadowing リスクもない
-- （public.tenants 等は既存、extensions/public は非特権ロールに書込不可）。
--
-- ponytail: Supabase 厳格運用は search_path='' + 本文完全修飾。
--   アップグレード経路 = 各 relation を public.<name> に修飾して '' に戻す。
-- =============================================================================

ALTER FUNCTION public.platform_regional_stats() SET search_path = public, extensions;
ALTER FUNCTION public.platform_tenant_category_stats() SET search_path = public, extensions;
ALTER FUNCTION public.insurer_get_certificate(text, text, text) SET search_path = public, extensions;
ALTER FUNCTION public.insurer_search_certificates(text, integer, integer, text, text) SET search_path = public, extensions;
ALTER FUNCTION public.insurer_search_stores(text, integer, integer, text, text) SET search_path = public, extensions;
ALTER FUNCTION public.insurer_search_vehicles(text, integer, integer, text, text) SET search_path = public, extensions;
