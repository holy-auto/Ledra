-- is_pii_disclosed() が本番で常に失敗しているのを直す。
--
-- 20260404000000_fix_security_definer_search_path.sql が 13 関数に
-- `ALTER FUNCTION ... SET search_path = ''` を当てたとき、関数**本体**の
-- スキーマ修飾を忘れた 2 本が残った。search_path が空だと非修飾の識別子は
-- 解決できないので、呼ぶと必ずこうなる:
--
--   ERROR: 42P01: relation "pii_disclosure_consents" does not exist
--   CONTEXT: SQL function "is_pii_disclosed" during startup
--
-- 2 本のうち insurer_accessible_tenant_ids は
-- 20260903123728_fix_insurer_accessible_tenant_ids_search_path.sql で解消済み。
-- **is_pii_disclosed は同じ形のまま取りこぼされていた**（本番で 42P01 を再現して確認）。
-- 保険会社への PII 開示同意の判定がこれで、呼ぶと必ず落ちる。
--
-- 取りこぼしが繰り返されるのは、この壊れ方が実行時にしか現れないため。
-- CREATE では作れない（check_function_bodies が本体を検証して弾く）ので、
-- 入り込む経路は「正常に作ったあとで ALTER」だけ ―― ALTER は本体を再検証しない。
-- 静的に読んでも気づけないので、scripts/replay-migrations.mjs が再生後の DB を
-- 走査して、この形が 1 本でも残っていたら CI を落とすようにした。
--
-- 変更は参照のスキーマ修飾のみ。シグネチャ・返り値・volatility・SECURITY DEFINER・
-- search_path='' はすべて現行のまま維持する（挙動は変えず、壊れた参照だけを直す）。

CREATE OR REPLACE FUNCTION public.is_pii_disclosed(p_certificate_id uuid, p_insurer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.pii_disclosure_consents
    WHERE certificate_id = p_certificate_id
      AND insurer_id = p_insurer_id
      AND is_active = true
      AND revoked_at IS NULL
      AND insurer_requested_at IS NOT NULL
      AND tenant_consented_at IS NOT NULL
  );
$function$;
