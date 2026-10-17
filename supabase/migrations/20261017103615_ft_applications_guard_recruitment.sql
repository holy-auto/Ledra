-- 施工店からの応募（作成・再応募）を、受付中の募集にだけ、募集どおりのプロジェクト・メーカーで、本人名義で入れられるようにする。
--
-- 20261017103613 の ft_applications_tenant_write_guard は、状態と審査欄しか見ていなかった（/code-review の指摘）:
--   - 締め切った募集・期限切れの募集にも、PostgREST から直接応募を作れた・不採用を pending に戻せた
--     （アプリは route 側の is_open / isRecruitmentExpired でしか止めていない）
--   - recruitment_id と食い違う project_id / manufacturer_id を入れられた
--   - applied_by（応募者）に任意の利用者 ID を入れられた
-- そこで作成と再応募のときに、募集が受付中（is_open かつ締切前。締切なしは無期限 —— isRecruitmentExpired と同じ）で、
-- プロジェクト・メーカーが募集と一致することを確かめ、applied_by はログイン中の本人で上書きする（契約の同意者と同じ扱い）。
--
-- 募集は施工店に is_open の行だけ見える（ft_recruitments_tenant_select）。この関数は SECURITY INVOKER なので、
-- 締め切った募集は見えず、そのまま拒否になる。取り下げ（pending → withdrawn）は募集を見ない（締切後も取り下げられる）。

CREATE OR REPLACE FUNCTION public.ft_applications_tenant_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- SECURITY INVOKER なので current_user は書き込んだ人のロール（PostgREST では authenticated / anon）
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'withdrawn'
     AND (to_jsonb(NEW) - 'status' - 'updated_at') = (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.review_notes IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION '施工店は審査済みの応募を作れません（status=%）', NEW.status USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    OLD.status IN ('withdrawn', 'rejected') AND NEW.status = 'pending'
    AND NEW.review_notes IS NULL AND NEW.reviewed_by IS NULL AND NEW.reviewed_at IS NULL
    AND (to_jsonb(NEW) - ARRAY['status', 'applied_by', 'notes', 'review_notes', 'reviewed_by', 'reviewed_at', 'updated_at'])
      = (to_jsonb(OLD) - ARRAY['status', 'applied_by', 'notes', 'review_notes', 'reviewed_by', 'reviewed_at', 'updated_at'])
  ) THEN
    RAISE EXCEPTION '施工店はこの応募の更新をできません（% → %）', OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;

  -- ここに来るのは作成と再応募。募集が受付中で、プロジェクト・メーカーが募集と一致すること
  IF NOT EXISTS (
    SELECT 1 FROM public.ft_recruitments r
    WHERE r.id = NEW.recruitment_id
      AND r.project_id = NEW.project_id
      AND r.manufacturer_id = NEW.manufacturer_id
      AND r.is_open
      AND (r.deadline IS NULL OR r.deadline >= now())
  ) THEN
    RAISE EXCEPTION '受付中の募集ではありません' USING ERRCODE = '42501';
  END IF;

  NEW.applied_by := auth.uid();
  RETURN NEW;
END;
$$;
