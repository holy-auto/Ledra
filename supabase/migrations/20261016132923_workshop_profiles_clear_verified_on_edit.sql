-- 施工店が設備・資格の中身を書き換えたら、「検証済み」（verified_at・verified_by）を外す。
--
-- 20261015134519 で、施工店（authenticated / anon）からの書き込みでは verified_at・verified_by を据え置くようにした。
-- だが据え置きのままだと、検証した後に施工店が許可番号や資格者を書き換えても「検証済み」が残り、
-- メーカー画面には誰も確かめていない中身が「検証済み」として出る（代表判断 2026-10-16）。
--
-- 施工店からの UPDATE で、検証の対象になる列（verified_at・verified_by・updated_at・created_at 以外の全列）が
-- 1つでも変わったら NULL にする。何も変わらない保存（同じ内容での upsert など）では据え置く。
-- 施工店が自分で付けられないこと（新規は NULL、変更は据え置き）は前のとおり。
-- サーバー側（service role）と運営の SQL は対象外。

CREATE OR REPLACE FUNCTION public.workshop_cap_profiles_lock_verified_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- 検証の対象ではない列。これ以外の列が変わったら「中身が変わった」とみなす（列を足しても自動で対象に入る）
  k_meta constant text[] := ARRAY['verified_at', 'verified_by', 'updated_at', 'created_at'];
BEGIN
  -- SECURITY INVOKER なので current_user は書き込んだ人のロール（PostgREST では authenticated / anon）
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - k_meta) IS NOT DISTINCT FROM (to_jsonb(OLD) - k_meta) THEN
      NEW.verified_at := OLD.verified_at;
      NEW.verified_by := OLD.verified_by;
    ELSE
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
