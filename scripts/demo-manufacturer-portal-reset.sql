-- scripts/demo-manufacturer-portal.sql で入れたメーカーポータルのデモデータを消す。
-- デモ用メーカー（de0000000200）とデモ施工店（de0000000010）の行だけを触る。
-- 証明書は消さず、メーカー指定デザインの紐づけを外す（service_type は setup-demo-tenant.ts の再実行で元に戻る）。
do $$
declare
  m constant uuid := '00000000-0000-0000-0000-de0000000200';
  t constant uuid := '00000000-0000-0000-0000-de0000000010';
begin
  -- 先に証明書の紐づけを外す（テンプレートを消す前に）
  update certificates set manufacturer_id = null, manufacturer_template_id = null, coating_products_json = '[]'::jsonb,
    ppf_coverage_json = '[]'::jsonb, warranty_period_end = null
  where tenant_id = t and manufacturer_id = m;
  delete from ft_projects where manufacturer_id = m;  -- 実証テストの子の行は cascade で消える
  delete from manufacturer_notifications where manufacturer_id = m;
  delete from manufacturer_certified_tenants where manufacturer_id = m and tenant_id = t;
  delete from manufacturer_templates where id in ('00000000-0000-0000-0000-de0210000002', '00000000-0000-0000-0000-de0210000003');
  delete from workshop_capability_profiles where tenant_id = t;
end $$;
