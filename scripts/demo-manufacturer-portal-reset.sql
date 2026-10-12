-- scripts/demo-manufacturer-portal.sql で入れたメーカーポータルのデモデータを消す。
-- デモ用メーカー（de0000000200）とデモ施工店（de0000000010）の行だけを触る。
-- 証明書は消さず、メーカー指定デザインの紐づけを外し、デモ SQL が書き換えた10件を元に戻す
-- （適用前は10件とも使用製品・PPF パネル・保証期間が空だった。2026-10-12 に本番で確認。service_type は適用前の値）。
do $$
declare
  m constant uuid := '00000000-0000-0000-0000-de0000000200';
  t constant uuid := '00000000-0000-0000-0000-de0000000010';
begin
  -- 先に証明書の紐づけを外す（テンプレートを消す前に）
  update certificates c set coating_products_json = '[]'::jsonb, ppf_coverage_json = '[]'::jsonb, warranty_period_end = null,
    service_type = v.service_type
  from (values
    ('LEDRA-DEMO-0001', 'glass-coating'), ('LEDRA-DEMO-0002', 'ceramic-coating'), ('LEDRA-DEMO-0003', 'film-protection'),
    ('LEDRA-DEMO-0004', 'glass-coating'), ('LEDRA-DEMO-0008', 'glass-coating'), ('LEDRA-DEMO-0010', 'ceramic-coating'),
    ('LEDRA-DEMO-0011', 'glass-coating'), ('LEDRA-DEMO-0012', 'film-protection'), ('LEDRA-DEMO-0015', 'ceramic-coating'),
    ('LEDRA-DEMO-0016', 'glass-coating')
  ) as v(public_id, service_type)
  where c.tenant_id = t and c.public_id = v.public_id and c.manufacturer_id = m;
  update certificates set manufacturer_id = null, manufacturer_template_id = null where tenant_id = t and manufacturer_id = m;

  delete from ft_projects where manufacturer_id = m;  -- 実証テストの子の行は cascade で消える
  delete from manufacturer_notifications where manufacturer_id = m;
  delete from manufacturer_certified_tenants where manufacturer_id = m and tenant_id = t;
  delete from manufacturer_templates where id in ('00000000-0000-0000-0000-de0210000002', '00000000-0000-0000-0000-de0210000003');
  delete from workshop_capability_profiles where tenant_id = t;
end $$;
