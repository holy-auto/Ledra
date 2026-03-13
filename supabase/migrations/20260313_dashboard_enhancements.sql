-- ⑥ テナントに業種区分と都道府県を追加
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS category text;
COMMENT ON COLUMN tenants.category IS '業種区分: detailing, maintenance, custom, bodywork';

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS prefecture text;
COMMENT ON COLUMN tenants.prefecture IS '都道府県（例: 東京都, 大阪府）';

-- ⑦ プラットフォーム全体統計用 RPC（SECURITY DEFINER で RLS を迂回）

-- 全体の証明書ステータス別カウント
CREATE OR REPLACE FUNCTION platform_certificate_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'active', COUNT(*) FILTER (WHERE status = 'active'),
    'void', COUNT(*) FILTER (WHERE status = 'void'),
    'expired', COUNT(*) FILTER (WHERE status = 'expired'),
    'draft', COUNT(*) FILTER (WHERE status = 'draft')
  ) INTO result
  FROM certificates;
  RETURN result;
END;
$$;

-- 業種別テナント数
CREATE OR REPLACE FUNCTION platform_tenant_category_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(r)) INTO result
  FROM (
    SELECT
      COALESCE(category, 'unset') AS category,
      COUNT(*) AS count
    FROM tenants
    WHERE is_active = true
    GROUP BY category
    ORDER BY count DESC
  ) r;
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- 保険会社数
CREATE OR REPLACE FUNCTION platform_insurer_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM insurers;
  RETURN cnt;
END;
$$;

-- 都道府県別テナント数
CREATE OR REPLACE FUNCTION platform_regional_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(r)) INTO result
  FROM (
    SELECT
      COALESCE(prefecture, '未設定') AS prefecture,
      COUNT(*) AS count
    FROM tenants
    WHERE is_active = true
    GROUP BY prefecture
    ORDER BY count DESC
  ) r;
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ⑧ 請求書明細と証明書の紐付け用: items_json に certificate_id を含められるようにする
-- (items_json は jsonb なのでスキーマ変更不要。アプリ側で対応)
-- 証明書IDから施工料金を取得するヘルパー
CREATE OR REPLACE FUNCTION get_certificate_service_price(cert_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  price integer;
BEGIN
  SELECT service_price INTO price FROM certificates WHERE id = cert_id;
  RETURN price;
END;
$$;
