-- search_path='' の SECURITY DEFINER 関数が、本体でスキーマ非修飾のテーブルを
-- 参照していて実行時に必ず落ちていたのを直す。
--
-- 20260404000000_fix_security_definer_search_path.sql が search_path を締めた
-- とき、関数**本体**の修飾を忘れた2本がそのまま残っていた。search_path が空だと
-- 非修飾の識別子は解決できないので、呼ぶと必ずこうなる:
--
--   ERROR: 42P01: relation "insurer_tenant_access" does not exist
--   CONTEXT: SQL function "insurer_accessible_tenant_ids" during startup
--
-- 影響（本番で実際に確認）:
--   insurer_accessible_tenant_ids  … 保険会社ポータルの証明書検索・車両検索・
--                                     店舗検索の3本が、この関数を呼ぶため連鎖して失敗
--   is_pii_disclosed               … 保険会社への PII 開示同意の判定
--
-- 全 SECURITY DEFINER 関数を走査して、この形（search_path='' ＋ 非修飾参照）に
-- 該当するのはこの2本だけであることを確認済み。同じ取りこぼしが二度と入らない
-- よう、scripts/replay-migrations.mjs が再生後に同じ走査を行う。
--
-- SECURITY DEFINER・STABLE・search_path='' は元のまま保つ。変えるのは本体の
-- 参照を public. で修飾することだけ。

CREATE OR REPLACE FUNCTION insurer_accessible_tenant_ids(p_insurer_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tenant_id
  FROM public.insurer_tenant_access
  WHERE insurer_id = p_insurer_id
    AND is_active = true
    AND revoked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION is_pii_disclosed(p_certificate_id uuid, p_insurer_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pii_disclosure_consents
    WHERE certificate_id = p_certificate_id
      AND insurer_id = p_insurer_id
      AND is_active = true
      AND revoked_at IS NULL
      AND insurer_requested_at IS NOT NULL
      AND tenant_consented_at IS NOT NULL
  );
$$;
