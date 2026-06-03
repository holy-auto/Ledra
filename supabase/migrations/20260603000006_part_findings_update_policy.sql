-- =============================================================================
-- 部品装着インテグリティ — Phase 12: findings の対応操作（status 更新）
--
-- 設計: docs/parts-installation-integrity-design.md §4 L7
--
-- 監査ダッシュボードから検知(part_integrity_findings)を
-- acknowledged / resolved / dismissed に更新できるよう UPDATE ポリシーを追加する。
-- （findings は不変の証拠ではなく運用トリアージ用データなので更新を許可する。
--   不変なのは part_installations / evidence 側で、そちらはガードで保護済み。）
-- =============================================================================

CREATE POLICY part_findings_update ON part_integrity_findings
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
