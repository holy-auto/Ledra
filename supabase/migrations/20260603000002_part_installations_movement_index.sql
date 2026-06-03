-- =============================================================================
-- 部品装着インテグリティ — Phase 1: 既存テーブルへの索引（CONCURRENTLY）
--
-- inventory_movements は既存テーブルのため、装着消費の逆引き索引は
-- CONCURRENTLY で（書き込みをブロックしないよう）単独マイグレーションで付与する。
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_movements_installation
  ON inventory_movements(installation_id)
  WHERE installation_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_items_tenant_gtin
  ON inventory_items(tenant_id, gtin)
  WHERE gtin IS NOT NULL;
