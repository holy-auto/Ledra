-- ============================================================
-- Standard Templates: 新規発行ページで全テナントが利用可能な
-- スタンダードテンプレートを追加
-- ============================================================

-- 1. templates.tenant_id を NULLABLE に変更（共通テンプレート用）
ALTER TABLE templates ALTER COLUMN tenant_id DROP NOT NULL;

-- 1b. scope/tenant_id のチェック制約を緩和（共通テンプレートは tenant_id NULL を許可）
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_scope_tenant_chk;

-- 2. RLSポリシー更新: tenant_id IS NULL の共通テンプレートは全認証ユーザーがSELECT可能
DROP POLICY IF EXISTS "tpl_select" ON templates;
CREATE POLICY "tpl_select" ON templates
  FOR SELECT USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT my_tenant_ids())
  );

-- INSERT/UPDATE/DELETE はテナント固有テンプレートのみ（共通テンプレートは変更不可）
DROP POLICY IF EXISTS "tpl_insert" ON templates;
CREATE POLICY "tpl_insert" ON templates
  FOR INSERT WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT my_tenant_ids())
  );

DROP POLICY IF EXISTS "tpl_update" ON templates;
CREATE POLICY "tpl_update" ON templates
  FOR UPDATE USING (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT my_tenant_ids())
  );

DROP POLICY IF EXISTS "tpl_delete" ON templates;
CREATE POLICY "tpl_delete" ON templates
  FOR DELETE USING (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT my_tenant_ids())
  );

-- 3. スタンダードテンプレートを共通テンプレートとして追加
--    tenant_id = NULL, category でフォーム切替
INSERT INTO templates (tenant_id, scope, name, category, schema_json, layout_version)
VALUES
  (
    NULL, 'tenant', 'コーティングスタンダード', 'coating',
    '{"version":1,"sections":[]}'::jsonb, 1
  ),
  (
    NULL, 'tenant', 'PPFスタンダード', 'ppf',
    '{"version":1,"sections":[]}'::jsonb, 1
  ),
  (
    NULL, 'tenant', '整備スタンダード', 'maintenance',
    '{"version":1,"sections":[]}'::jsonb, 1
  ),
  (
    NULL, 'tenant', '鈑金塗装スタンダード', 'body_repair',
    '{"version":1,"sections":[]}'::jsonb, 1
  );

-- 4. platform_templates から非スタンダードテンプレートを削除
DELETE FROM platform_templates WHERE name IN (
  'プレミアムブラック',
  'クリーンホワイト',
  'クラフトナチュラル'
);

-- 5. テナント固有の旧テンプレートを削除
DELETE FROM templates WHERE name LIKE 'HOLY標準テンプレ%';
