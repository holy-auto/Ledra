-- Deduplicate brands & coating_products, then add UNIQUE constraints
-- to prevent future duplicates.

-- ============================================================
-- Step 1: Deduplicate brands
-- For each group of (tenant_id, name) duplicates, keep the one
-- with the most products. Reassign products before deleting.
-- ============================================================
DO $$
DECLARE
  dup    RECORD;
  keep_id uuid;
BEGIN
  -- Platform-common brands (tenant_id IS NULL)
  FOR dup IN (
    SELECT name
    FROM   brands
    WHERE  tenant_id IS NULL
    GROUP  BY name
    HAVING COUNT(*) > 1
  ) LOOP
    -- Keep the brand with the most products (tiebreak: earliest created_at)
    SELECT id INTO keep_id
    FROM   brands
    WHERE  tenant_id IS NULL AND name = dup.name
    ORDER  BY (
      SELECT COUNT(*) FROM coating_products cp WHERE cp.brand_id = brands.id
    ) DESC, created_at
    LIMIT  1;

    -- Reassign products from duplicate brands to the kept brand
    UPDATE coating_products
    SET    brand_id = keep_id
    WHERE  brand_id IN (
      SELECT id FROM brands
      WHERE  tenant_id IS NULL AND name = dup.name AND id <> keep_id
    );

    -- Remove duplicate brands
    DELETE FROM brands
    WHERE  tenant_id IS NULL AND name = dup.name AND id <> keep_id;
  END LOOP;

  -- Tenant-specific brands (tenant_id IS NOT NULL)
  FOR dup IN (
    SELECT tenant_id, name
    FROM   brands
    WHERE  tenant_id IS NOT NULL
    GROUP  BY tenant_id, name
    HAVING COUNT(*) > 1
  ) LOOP
    SELECT id INTO keep_id
    FROM   brands
    WHERE  tenant_id = dup.tenant_id AND name = dup.name
    ORDER  BY (
      SELECT COUNT(*) FROM coating_products cp WHERE cp.brand_id = brands.id
    ) DESC, created_at
    LIMIT  1;

    UPDATE coating_products
    SET    brand_id = keep_id
    WHERE  brand_id IN (
      SELECT id FROM brands
      WHERE  tenant_id = dup.tenant_id AND name = dup.name AND id <> keep_id
    );

    DELETE FROM brands
    WHERE  tenant_id = dup.tenant_id AND name = dup.name AND id <> keep_id;
  END LOOP;
END $$;

-- ============================================================
-- Step 2: Deduplicate coating_products
-- Within the same brand, keep the row with the smallest ctid.
-- ============================================================
DELETE FROM coating_products a
USING  coating_products b
WHERE  a.ctid > b.ctid
  AND  a.brand_id = b.brand_id
  AND  a.name     = b.name;

-- ============================================================
-- Step 3: Add UNIQUE constraints (partial indexes)
-- ============================================================

-- brands: platform-common (tenant_id IS NULL) → unique by name
CREATE UNIQUE INDEX IF NOT EXISTS uniq_brands_platform_name
  ON brands (name)
  WHERE tenant_id IS NULL;

-- brands: tenant-specific → unique by (tenant_id, name)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_brands_tenant_name
  ON brands (tenant_id, name)
  WHERE tenant_id IS NOT NULL;

-- coating_products: unique product name per brand
CREATE UNIQUE INDEX IF NOT EXISTS uniq_coating_products_brand_name
  ON coating_products (brand_id, name);
