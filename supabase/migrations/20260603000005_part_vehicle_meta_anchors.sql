-- =============================================================================
-- 部品装着インテグリティ — Phase 8: 車両単位 部品メタアンカー
--
-- 設計: docs/parts-installation-integrity-design.md §6.5（全件メタ）
--
-- 既存パスポート meta-anchor とは独立に、車両ごとに「確定済み装着の content_hash 群」を
-- 1つの meta_hash に束ね、その meta_hash を Polygon に1tx でアンカーする。
-- 1tx で多数の装着を担保し、消耗品も含む全件をほぼ無償でアンカーできる。
-- =============================================================================

CREATE TABLE IF NOT EXISTS part_vehicle_meta_anchors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_id          uuid NOT NULL UNIQUE REFERENCES vehicles(id) ON DELETE CASCADE,
  meta_hash           text NOT NULL,
  content_hash_count  integer NOT NULL DEFAULT 0,
  polygon_tx_hash     text,
  polygon_network     text CHECK (polygon_network IS NULL OR polygon_network IN ('polygon','amoy')),
  anchored_at         timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_vehicle_meta_tenant ON part_vehicle_meta_anchors(tenant_id);

ALTER TABLE part_vehicle_meta_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY part_vehicle_meta_select ON part_vehicle_meta_anchors
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
