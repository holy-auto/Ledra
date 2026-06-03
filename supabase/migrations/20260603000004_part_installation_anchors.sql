-- =============================================================================
-- 部品装着インテグリティ — Phase 4: アンカー記録テーブル
--
-- 設計: docs/parts-installation-integrity-design.md §6.5
--
-- part_installations は customer_verified で完全凍結され polygon_tx_hash すら
-- 更新できない（凍結ガード）。そこでアンカー結果は別の追記テーブルに記録する。
-- 1装着につき最大1アンカー（unique installation_id）。
-- =============================================================================

CREATE TABLE IF NOT EXISTS part_installation_anchors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id  uuid NOT NULL UNIQUE REFERENCES part_installations(id) ON DELETE CASCADE,
  content_hash     text NOT NULL,
  polygon_tx_hash  text,
  polygon_network  text CHECK (polygon_network IS NULL OR polygon_network IN ('polygon','amoy')),
  anchored_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_anchors_tenant ON part_installation_anchors(tenant_id);

ALTER TABLE part_installation_anchors ENABLE ROW LEVEL SECURITY;

-- 参照のみ（書き込みは cron / service-role）。
CREATE POLICY part_anchors_select ON part_installation_anchors
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
