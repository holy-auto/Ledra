-- ============================================================
-- Field Test: Tenant-side RLS policies + ft-evidence Storage bucket
-- ============================================================
-- Block A: 施工店ユーザーが自社に割り当てられた FT データを
-- 閲覧・操作できるようにする RLS ポリシー群と、
-- 証拠ファイル保存用の Storage バケットを追加する。
--
-- 既存ポリシー (manufacturer_id → my_manufacturer_ids()) はそのまま残る。
-- ここでは tenant_id → my_tenant_ids() の SELECT/INSERT/UPDATE を追加。
-- ============================================================

-- ================================================================
-- ft_applications: テナントが自社の応募を閲覧・作成・更新
-- ================================================================
CREATE POLICY "ft_applications_tenant_select" ON ft_applications
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));

CREATE POLICY "ft_applications_tenant_insert" ON ft_applications
  FOR INSERT WITH CHECK (tenant_id IN (SELECT public.my_tenant_ids()));

CREATE POLICY "ft_applications_tenant_update" ON ft_applications
  FOR UPDATE USING (tenant_id IN (SELECT public.my_tenant_ids()));

-- ================================================================
-- ft_agreements: テナントが自社の同意を閲覧・更新（受諾操作）
-- ================================================================
CREATE POLICY "ft_agreements_tenant_select" ON ft_agreements
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));

CREATE POLICY "ft_agreements_tenant_update" ON ft_agreements
  FOR UPDATE USING (tenant_id IN (SELECT public.my_tenant_ids()));

-- ================================================================
-- ft_training_completions: テナントが自社の受講記録を閲覧・作成
-- module_id 経由ではなく tenant_id 直接で判定する施工店側ポリシー。
-- ================================================================
CREATE POLICY "ft_training_completions_tenant_select" ON ft_training_completions
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));

CREATE POLICY "ft_training_completions_tenant_insert" ON ft_training_completions
  FOR INSERT WITH CHECK (tenant_id IN (SELECT public.my_tenant_ids()));

-- ================================================================
-- ft_jobs: テナントが自社に割り当てられた案件を閲覧・更新
-- ================================================================
CREATE POLICY "ft_jobs_tenant_select" ON ft_jobs
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));

CREATE POLICY "ft_jobs_tenant_update" ON ft_jobs
  FOR UPDATE USING (tenant_id IN (SELECT public.my_tenant_ids()));

-- ================================================================
-- ft_conditions: テナントはプロジェクトの施工条件を閲覧する必要がある。
-- 自社の案件が紐づくプロジェクトの条件を参照できるようにする。
-- ================================================================
CREATE POLICY "ft_conditions_tenant_select" ON ft_conditions
  FOR SELECT USING (
    project_id IN (
      SELECT project_id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );

-- ================================================================
-- ft_condition_checks: テナントが自社案件のチェック記録を閲覧・作成
-- ================================================================
CREATE POLICY "ft_condition_checks_tenant_select" ON ft_condition_checks
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );

CREATE POLICY "ft_condition_checks_tenant_insert" ON ft_condition_checks
  FOR INSERT WITH CHECK (
    job_id IN (
      SELECT id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );

-- ================================================================
-- ft_evidence: テナントが自社の証拠を閲覧・作成
-- ================================================================
CREATE POLICY "ft_evidence_tenant_select" ON ft_evidence
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));

CREATE POLICY "ft_evidence_tenant_insert" ON ft_evidence
  FOR INSERT WITH CHECK (tenant_id IN (SELECT public.my_tenant_ids()));

-- ================================================================
-- ft_inspections: テナントが自社案件の検査結果を閲覧
-- (検査の作成・更新はメーカー側のみ)
-- ================================================================
CREATE POLICY "ft_inspections_tenant_select" ON ft_inspections
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );

-- ================================================================
-- ft_defects: テナントが自社に紐づく不具合を閲覧
-- (不具合の作成・更新はメーカー側のみ)
-- ================================================================
CREATE POLICY "ft_defects_tenant_select" ON ft_defects
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));

-- ================================================================
-- ft_recruitments: テナントが公開中の募集を閲覧
-- (is_open = true のもののみ — 非公開募集はメーカーのみ参照)
-- ================================================================
CREATE POLICY "ft_recruitments_tenant_select" ON ft_recruitments
  FOR SELECT USING (is_open = true);

-- ================================================================
-- ft_training_modules: テナントが参加プロジェクトの教育モジュールを閲覧
-- ================================================================
CREATE POLICY "ft_training_modules_tenant_select" ON ft_training_modules
  FOR SELECT USING (
    project_id IN (
      SELECT project_id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );

-- ================================================================
-- Storage: ft-evidence バケット (非公開)
-- ================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('ft-evidence', 'ft-evidence', false)
ON CONFLICT (id) DO NOTHING;
