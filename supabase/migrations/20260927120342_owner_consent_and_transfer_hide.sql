-- 保険会社への個人情報開示に「オーナー本人の同意」を足す／所有権移転後は旧オーナーのマイページから車両を外す。
-- 代表判断 2026-09-27（DECISION_LOG）。
--
-- 1) pii_disclosure_consents にオーナー同意の列を足し、is_pii_disclosed() の条件に入れる。
--    プライバシーポリシー「保険会社への証明書情報の提供（ユーザーが許可した場合）」に対し、
--    これまで同意していたのは施工店の管理者だけだった。条件は足すだけで緩めない
--    （保険会社の申請 AND 施工店の承認 AND オーナーの同意）。
--    同意はマイページ（/api/customer/pii-consent）から、セッションに customer_id が
--    結び付いている顧客だけが行える。
-- 2) certificates に hidden_from_owner_portal_at を足す。移転が受諾された時点で、その VIN の
--    受諾前の証明書に印を付け、顧客マイページの一覧・件数から外す（/c の公開ページは変えない）。

ALTER TABLE public.pii_disclosure_consents
  ADD COLUMN IF NOT EXISTS owner_consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_consented_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pii_disclosure_consents.owner_consented_at IS
  'オーナー（証明書の顧客）本人がマイページで開示に同意した時刻。is_pii_disclosed() の必須条件。';
COMMENT ON COLUMN public.pii_disclosure_consents.owner_consented_customer_id IS
  '同意したマイページセッションの customer_id（誰が同意したかの記録）。';

-- 定義は 20260907000000 のものに owner_consented_at の条件を1行足しただけ。
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
      AND tenant_consented_at IS NOT NULL
      AND owner_consented_at IS NOT NULL
  );
$function$;

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS hidden_from_owner_portal_at timestamptz;

COMMENT ON COLUMN public.certificates.hidden_from_owner_portal_at IS
  '車両パスポートの所有権移転が受諾された時刻。これが入った証明書は顧客マイページ（旧オーナー）に出さない。';
