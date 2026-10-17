-- 実証テストの応募・契約・案件（ft_applications / ft_agreements / ft_jobs）を、施工店が書ける範囲を
-- アプリの正規操作と同じだけに絞る。
--
-- 施工店向けの書き込みポリシー（20260922000000_repair_ft_tenant_rls_drift.sql）は
--   ft_applications_tenant_insert / _tenant_update、ft_agreements_tenant_update、ft_jobs_tenant_update
-- がどれも tenant_id IN my_tenant_ids() だけで、列も遷移も見ていない。施工店は PostgREST を直接叩けば
--   - 応募を自分で status = 'approved' にできる（新規でも更新でも）。メーカーの案件割当・不具合報告は
--     「承認済みの応募」だけを条件にしている（src/lib/fieldTest/applicationGate.ts）ので、承認を飛ばせる
--   - 契約の本文 document_text・document_url・種別を書き換えてから同意できる。同意を取り消せる
--   - 案件を自分で inspection / completed にでき、manufacturer_id・project_id も付け替えられる
--
-- 施工店の正規の書き込みは利用者のクライアント（withCaller の supabase / resolveMobileCaller の supabase）で、
-- 次の5つだけ（src/lib/fieldTest/tenantQueries.ts、2026-10-17 に全経路を確認）:
--   1. 応募の作成       createApplication       INSERT（status は既定の pending、審査欄は空）
--   2. 応募の再応募     createApplication       withdrawn / rejected → pending、applied_by・notes を入れ直し審査欄を空にする
--   3. 応募の取り下げ   withdrawApplication     pending → withdrawn
--   4. 契約への同意     acceptAgreement         accepted false → true、accepted_by・accepted_at
--   5. 案件の状態更新   updateTenantFtJobStatus assigned → in_progress → evidence_submitted
--                                               （validateTenantStatusTransition と同じ表）
-- メーカー側の書き込みは service role なので、ここでは止めない。ポリシーを外すと 1〜5 が通らなくなるため、
-- ポリシーは残してトリガーで列と遷移を絞る（workshop_capability_profiles の verified_at と同じ形、20261015134519）。
--
-- 列の比較は「変えてよい列を除いた行全体」で行う。後から列が増えても、施工店からは変えられない側に入る。
-- 拒否は 42501（PostgREST では 403）。正規の5操作では起きない。

-- ── ft_applications ──
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

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.review_notes IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION '施工店は審査済みの応募を作れません（status=%）', NEW.status USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'withdrawn'
     AND (to_jsonb(NEW) - 'status' - 'updated_at') = (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('withdrawn', 'rejected') AND NEW.status = 'pending'
     AND NEW.review_notes IS NULL AND NEW.reviewed_by IS NULL AND NEW.reviewed_at IS NULL
     AND (to_jsonb(NEW) - ARRAY['status', 'applied_by', 'notes', 'review_notes', 'reviewed_by', 'reviewed_at', 'updated_at'])
       = (to_jsonb(OLD) - ARRAY['status', 'applied_by', 'notes', 'review_notes', 'reviewed_by', 'reviewed_at', 'updated_at']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '施工店はこの応募の更新をできません（% → %）', OLD.status, NEW.status USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS ft_applications_tenant_write_guard ON public.ft_applications;
CREATE TRIGGER ft_applications_tenant_write_guard
  BEFORE INSERT OR UPDATE ON public.ft_applications
  FOR EACH ROW EXECUTE FUNCTION public.ft_applications_tenant_write_guard();

-- ── ft_agreements ──
CREATE OR REPLACE FUNCTION public.ft_agreements_tenant_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF OLD.accepted IS DISTINCT FROM false OR NEW.accepted IS DISTINCT FROM true
     OR (to_jsonb(NEW) - ARRAY['accepted', 'accepted_by', 'accepted_at', 'updated_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['accepted', 'accepted_by', 'accepted_at', 'updated_at']) THEN
    RAISE EXCEPTION '施工店は契約への同意以外の更新をできません' USING ERRCODE = '42501';
  END IF;

  -- 誰がいつ同意したかは契約の証跡なので、送られてきた値ではなくログイン中の本人と DB の時刻で残す
  NEW.accepted_by := auth.uid();
  NEW.accepted_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ft_agreements_tenant_write_guard ON public.ft_agreements;
CREATE TRIGGER ft_agreements_tenant_write_guard
  BEFORE UPDATE ON public.ft_agreements
  FOR EACH ROW EXECUTE FUNCTION public.ft_agreements_tenant_write_guard();

-- ── ft_jobs ──
CREATE OR REPLACE FUNCTION public.ft_jobs_tenant_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- 遷移の表は src/lib/fieldTest/tenantQueries.ts の TENANT_STATUS_TRANSITIONS と同じ。片方だけ変えないこと
  IF NOT ((OLD.status = 'assigned' AND NEW.status = 'in_progress')
          OR (OLD.status = 'in_progress' AND NEW.status = 'evidence_submitted'))
     OR (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION '施工店はこの案件の更新をできません（% → %）', OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ft_jobs_tenant_write_guard ON public.ft_jobs;
CREATE TRIGGER ft_jobs_tenant_write_guard
  BEFORE UPDATE ON public.ft_jobs
  FOR EACH ROW EXECUTE FUNCTION public.ft_jobs_tenant_write_guard();
