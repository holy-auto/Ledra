-- Fix: RLS ポリシーの実体参照ずれを本番実体に合わせて再作成（リポジトリ⇄本番ドリフト解消）
--
-- 背景 / 検証:
--   一部の旧マイグレーションのポリシー定義が、存在しないテーブル "tenant_members"
--   （正: tenant_memberships）や、tenant_memberships に存在しない列 is_active を参照していた。
--   これは PostgreSQL の CREATE POLICY 時に検証されるため、そのままではクリーン再適用に失敗する。
--   本番 DB（施工証明書プロジェクト）を 2026-07-19 に pg_policies で実査した結果、対象ポリシーは
--   いずれも既に正しい定義（tenant_memberships 参照・is_active 述語なし）へ是正済みで、
--   テナント分離は本番で正しく機能していることを確認済み（＝本番のセキュリティホールではない）。
--   ただしリポジトリ側の該当マイグレーションファイルは誤った SQL のまま残っており、
--   本番の是正は「履歴に未記録の是正マイグレーション」経由で入ったため repo⇄prod がドリフトしている。
--
--   本ファイルは 20260406100000_fix_customer_inquiries_rls.sql と同じ「前方修正マイグレーション」
--   パターンで、customer_inquiries 以外の取りこぼしテーブルにも同じ是正を repo へ記録・適用する。
--   定義は現行本番の pg_policies と一致させてあるため、本番では冪等な no-op になる。
--   履歴マイグレーションは書き換えない（lint-migrations.js の「applied migrations are untouchable」方針）。
--
-- 対象:
--   [A] tenant_members → tenant_memberships:
--       signature_sessions(_tenant_select/_tenant_insert),
--       signature_audit_logs(audit_logs_tenant_select),
--       vehicle_mileage_logs(vml_*), vehicle_inspection_findings(vif_*), vehicle_part_replacements(vpr_*)
--   [B] tenant_memberships.is_active 述語の除去（列が存在しない）:
--       zkp_commitments, edge_devices, edge_events

-- ─────────────────────────────────────────────────────────────────────────────
-- [A] tenant_members → tenant_memberships
-- ─────────────────────────────────────────────────────────────────────────────

-- signature_sessions
drop policy if exists "signature_sessions_tenant_select" on signature_sessions;
create policy "signature_sessions_tenant_select"
  on signature_sessions for select
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

drop policy if exists "signature_sessions_tenant_insert" on signature_sessions;
create policy "signature_sessions_tenant_insert"
  on signature_sessions for insert
  with check (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

-- signature_audit_logs
drop policy if exists "audit_logs_tenant_select" on signature_audit_logs;
create policy "audit_logs_tenant_select"
  on signature_audit_logs for select
  using (
    session_id in (
      select id from signature_sessions
      where tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid())
    )
  );

-- vehicle_mileage_logs
drop policy if exists "vml_select" on vehicle_mileage_logs;
create policy "vml_select"
  on vehicle_mileage_logs for select
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

drop policy if exists "vml_insert" on vehicle_mileage_logs;
create policy "vml_insert"
  on vehicle_mileage_logs for insert
  with check (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

-- vehicle_inspection_findings
drop policy if exists "vif_select" on vehicle_inspection_findings;
create policy "vif_select"
  on vehicle_inspection_findings for select
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

drop policy if exists "vif_insert" on vehicle_inspection_findings;
create policy "vif_insert"
  on vehicle_inspection_findings for insert
  with check (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

-- vehicle_part_replacements
drop policy if exists "vpr_select" on vehicle_part_replacements;
create policy "vpr_select"
  on vehicle_part_replacements for select
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

drop policy if exists "vpr_insert" on vehicle_part_replacements;
create policy "vpr_insert"
  on vehicle_part_replacements for insert
  with check (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- [B] tenant_memberships.is_active 述語の除去（列が存在しないため）
-- ─────────────────────────────────────────────────────────────────────────────

-- zkp_commitments
drop policy if exists "tenant members can read zkp commitments" on zkp_commitments;
create policy "tenant members can read zkp commitments"
  on zkp_commitments for select
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

-- edge_devices
drop policy if exists "tenant members can manage edge devices" on edge_devices;
create policy "tenant members can manage edge devices"
  on edge_devices for all
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

-- edge_events
drop policy if exists "tenant members can read edge events" on edge_events;
create policy "tenant members can read edge events"
  on edge_events for select
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));
