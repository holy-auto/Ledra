-- 保険会社への氏名開示の条件を「保険会社の申請 AND オーナー本人の同意」にする。施工店の承認は外す。
-- 代表判断 2026-09-27（DECISION_LOG「開示はオーナー同意だけ」）。
--
-- 直前の 20260927120342 は施工店の承認を残したまま同意を足した（緩めずに足す）。
-- ところが施工店が承認する画面はどこにも無く、開示が最後まで通らなかった。
-- 同意の主体はプライバシーポリシーどおり本人だけにする。
-- 20260927120342 はプレビュー DB に適用済みなので書き換えず、ここで定義し直す。
--
-- tenant_consented_at / tenant_consented_by / tenant_reason 列は残す（過去の記録。書き込む経路は同じ PR で消した）。
-- CREATE OR REPLACE なので EXECUTE 権限（service_role のみ）はそのまま残る。
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
      AND owner_consented_at IS NOT NULL
  );
$function$;
