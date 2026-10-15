-- 施工店の設備・資格の「検証済み」（workshop_capability_profiles.verified_at）を、施工店からは変えられないようにする。
--
-- 施工店向けの書き込みポリシー（tenant_insert / tenant_update、tenant_id IN my_tenant_ids()）は列を絞っていないので、
-- 施工店は PostgREST から自分の行に verified_at を付けられた。メーカー画面はこれを「検証済み」として全メーカーに出すため、
-- 自己申告で「検証済み」を名乗れてしまう（#1334 のレビューで指摘、代表判断 2026-10-15）。
--
-- 利用者のクライアント（authenticated / anon）からの書き込みでは verified_at を据え置く（新規は NULL）。
-- 付けられるのはサーバー側（service role）とマイグレーション・運営の SQL だけ。
-- 施工店の画面（/api/admin・/api/mobile の field-test/workshop-profile）は verified_at を送らないので、影響しない。

CREATE OR REPLACE FUNCTION public.workshop_cap_profiles_lock_verified_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- SECURITY INVOKER なので current_user は書き込んだ人のロール（PostgREST では authenticated / anon）
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.verified_at := CASE WHEN TG_OP = 'UPDATE' THEN OLD.verified_at ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workshop_cap_profiles_lock_verified_at ON public.workshop_capability_profiles;
CREATE TRIGGER workshop_cap_profiles_lock_verified_at
  BEFORE INSERT OR UPDATE ON public.workshop_capability_profiles
  FOR EACH ROW EXECUTE FUNCTION public.workshop_cap_profiles_lock_verified_at();
