-- 外注職人の連携先（staff_members.linked_tenant_id）を、利用者のクライアントからは書けないようにする。
--
-- この列は外注が元請けの発行した連携コードを自分の Ledra で入力して埋める（20260906100002、
-- src/lib/staff/tenantLink.ts）。「相手の同意を前提にする」ための列で、元請けが一方的に指定するものではない。
-- ところが staff_members の書き込みポリシー（20260617000002 の staff_members_insert / _update）はロールしか見ないため、
-- 元請けの owner / admin は PostgREST から linked_tenant_id に任意の他テナントを入れられた。
-- 連携済みの外注には外注依頼を送れる（POST /api/admin/outsourced-work、src/lib/outsourcedWork/service.ts の
-- listContractorCandidates）ので、**相手の同意なしに相手のテナントへ依頼を送り込める**。
--
-- 正規の経路はどちらも service role（tenantLink.ts の admin()）:
--   - 連携の成立: redeemStaffLinkInvite（外注がコードを入力）
--   - 連携の解除: unlinkStaffTenant（元請けの管理画面から）
-- スタッフの作成・更新（/api/admin/staff）は利用者のクライアントだが、入力の型（src/lib/validations/staff.ts の
-- staffCreateSchema / staffUpdateSchema）に linked_tenant_id も tenant_id も無いので、影響しない。
--
-- 利用者のクライアント（authenticated / anon）からは:
--   - 新規作成で linked_tenant_id を入れられない
--   - 更新で linked_tenant_id を変えられない
--   - 連携済みの行の tenant_id を変えられない（行ごと別テナントへ移すと、移した先が同意なしに連携先になる）
-- 拒否は 42501（PostgREST では 403）。

CREATE OR REPLACE FUNCTION public.staff_members_lock_linked_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- SECURITY INVOKER なので current_user は書き込んだ人のロール（PostgREST では authenticated / anon）
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.linked_tenant_id IS NOT NULL THEN
      RAISE EXCEPTION '外注の連携先は連携コードでしか設定できません' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.linked_tenant_id IS DISTINCT FROM OLD.linked_tenant_id
        OR (OLD.linked_tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    RAISE EXCEPTION '外注の連携先は連携コードでしか変更できません' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_members_lock_linked_tenant ON public.staff_members;
CREATE TRIGGER staff_members_lock_linked_tenant
  BEFORE INSERT OR UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.staff_members_lock_linked_tenant();
