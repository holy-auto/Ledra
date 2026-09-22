-- ============================================================
-- Repair: Field Test テナント側 RLS ドリフト + 不足していた write ポリシー
-- ============================================================
-- 事象: `20260917100000_ft_tenant_rls_and_storage.sql` は本番 schema_migrations
-- に「適用済み」記録があるのに、そのポリシー群も ft-evidence バケットも本番に
-- 存在しない（recorded-but-not-applied ドリフト。2026-09-21 に本番 pg_policies /
-- storage.buckets で実測確認。ft_*_tenant_* ポリシー 0 件・バケット無し）。
-- このため施工店ユーザーの Field Test 参照・書き込みが RLS で全ブロックされる。
--
-- 対応:
--   1. 20260917100000 の tenant ポリシー群と ft-evidence バケットを冪等に再適用
--      （DROP POLICY IF EXISTS → CREATE。check:migrations の再生でも重複しない）。
--   2. 元migrationに欠けていた UPDATE ポリシーを補う:
--      ft_condition_checks / ft_training_completions は upsert(ON CONFLICT DO UPDATE)
--      なのに INSERT ポリシーしか無く、再保存が RLS で 500 になっていた。
--   3. workshop_capability_profiles に tenant の INSERT/UPDATE を追加（どのmigration
--      にも write ポリシーが無く、初回保存から失敗していた）。
--
-- 本番の Field Test 利用は 2026-09-21 時点で全ゼロ（実害未発生）。
-- 既存の manufacturer 側ポリシー（my_manufacturer_ids()）はそのまま残す。
-- ============================================================

-- ── ft_applications ──
DROP POLICY IF EXISTS "ft_applications_tenant_select" ON ft_applications;
CREATE POLICY "ft_applications_tenant_select" ON ft_applications
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));
DROP POLICY IF EXISTS "ft_applications_tenant_insert" ON ft_applications;
CREATE POLICY "ft_applications_tenant_insert" ON ft_applications
  FOR INSERT WITH CHECK (tenant_id IN (SELECT public.my_tenant_ids()));
DROP POLICY IF EXISTS "ft_applications_tenant_update" ON ft_applications;
CREATE POLICY "ft_applications_tenant_update" ON ft_applications
  FOR UPDATE USING (tenant_id IN (SELECT public.my_tenant_ids()));

-- ── ft_agreements ──
DROP POLICY IF EXISTS "ft_agreements_tenant_select" ON ft_agreements;
CREATE POLICY "ft_agreements_tenant_select" ON ft_agreements
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));
DROP POLICY IF EXISTS "ft_agreements_tenant_update" ON ft_agreements;
CREATE POLICY "ft_agreements_tenant_update" ON ft_agreements
  FOR UPDATE USING (tenant_id IN (SELECT public.my_tenant_ids()));

-- ── ft_training_completions（INSERT + 不足していた UPDATE を追加）──
DROP POLICY IF EXISTS "ft_training_completions_tenant_select" ON ft_training_completions;
CREATE POLICY "ft_training_completions_tenant_select" ON ft_training_completions
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));
DROP POLICY IF EXISTS "ft_training_completions_tenant_insert" ON ft_training_completions;
CREATE POLICY "ft_training_completions_tenant_insert" ON ft_training_completions
  FOR INSERT WITH CHECK (tenant_id IN (SELECT public.my_tenant_ids()));
DROP POLICY IF EXISTS "ft_training_completions_tenant_update" ON ft_training_completions;
CREATE POLICY "ft_training_completions_tenant_update" ON ft_training_completions
  FOR UPDATE USING (tenant_id IN (SELECT public.my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.my_tenant_ids()));

-- ── ft_jobs ──
DROP POLICY IF EXISTS "ft_jobs_tenant_select" ON ft_jobs;
CREATE POLICY "ft_jobs_tenant_select" ON ft_jobs
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));
DROP POLICY IF EXISTS "ft_jobs_tenant_update" ON ft_jobs;
CREATE POLICY "ft_jobs_tenant_update" ON ft_jobs
  FOR UPDATE USING (tenant_id IN (SELECT public.my_tenant_ids()));

-- ── ft_conditions ──
DROP POLICY IF EXISTS "ft_conditions_tenant_select" ON ft_conditions;
CREATE POLICY "ft_conditions_tenant_select" ON ft_conditions
  FOR SELECT USING (
    project_id IN (
      SELECT project_id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );

-- ── ft_condition_checks（INSERT + 不足していた UPDATE を追加）──
DROP POLICY IF EXISTS "ft_condition_checks_tenant_select" ON ft_condition_checks;
CREATE POLICY "ft_condition_checks_tenant_select" ON ft_condition_checks
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );
DROP POLICY IF EXISTS "ft_condition_checks_tenant_insert" ON ft_condition_checks;
CREATE POLICY "ft_condition_checks_tenant_insert" ON ft_condition_checks
  FOR INSERT WITH CHECK (
    job_id IN (
      SELECT id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );
DROP POLICY IF EXISTS "ft_condition_checks_tenant_update" ON ft_condition_checks;
CREATE POLICY "ft_condition_checks_tenant_update" ON ft_condition_checks
  FOR UPDATE USING (
    job_id IN (
      SELECT id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  )
  WITH CHECK (
    job_id IN (
      SELECT id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );

-- ── ft_evidence ──
DROP POLICY IF EXISTS "ft_evidence_tenant_select" ON ft_evidence;
CREATE POLICY "ft_evidence_tenant_select" ON ft_evidence
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));
DROP POLICY IF EXISTS "ft_evidence_tenant_insert" ON ft_evidence;
CREATE POLICY "ft_evidence_tenant_insert" ON ft_evidence
  FOR INSERT WITH CHECK (tenant_id IN (SELECT public.my_tenant_ids()));

-- ── ft_inspections（閲覧のみ。作成/更新はメーカー側）──
DROP POLICY IF EXISTS "ft_inspections_tenant_select" ON ft_inspections;
CREATE POLICY "ft_inspections_tenant_select" ON ft_inspections
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );

-- ── ft_defects（閲覧のみ）──
DROP POLICY IF EXISTS "ft_defects_tenant_select" ON ft_defects;
CREATE POLICY "ft_defects_tenant_select" ON ft_defects
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));

-- ── ft_recruitments（公開中の募集のみ閲覧）──
DROP POLICY IF EXISTS "ft_recruitments_tenant_select" ON ft_recruitments;
CREATE POLICY "ft_recruitments_tenant_select" ON ft_recruitments
  FOR SELECT USING (is_open = true);

-- ── ft_training_modules（参加プロジェクトの教育モジュール閲覧）──
DROP POLICY IF EXISTS "ft_training_modules_tenant_select" ON ft_training_modules;
CREATE POLICY "ft_training_modules_tenant_select" ON ft_training_modules
  FOR SELECT USING (
    project_id IN (
      SELECT project_id FROM ft_jobs
      WHERE tenant_id IN (SELECT public.my_tenant_ids())
    )
  );

-- ── workshop_capability_profiles（write ポリシーがどのmigrationにも無かった）──
-- 施工店が自社のケイパビリティを作成・更新できるようにする（upsert on tenant_id）。
-- 既存の authenticated SELECT はそのまま残す。
DROP POLICY IF EXISTS "workshop_cap_profiles_tenant_insert" ON workshop_capability_profiles;
CREATE POLICY "workshop_cap_profiles_tenant_insert" ON workshop_capability_profiles
  FOR INSERT WITH CHECK (tenant_id IN (SELECT public.my_tenant_ids()));
DROP POLICY IF EXISTS "workshop_cap_profiles_tenant_update" ON workshop_capability_profiles;
CREATE POLICY "workshop_cap_profiles_tenant_update" ON workshop_capability_profiles
  FOR UPDATE USING (tenant_id IN (SELECT public.my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.my_tenant_ids()));

-- ── Storage: ft-evidence バケット（非公開）──
INSERT INTO storage.buckets (id, name, public)
VALUES ('ft-evidence', 'ft-evidence', false)
ON CONFLICT (id) DO NOTHING;
