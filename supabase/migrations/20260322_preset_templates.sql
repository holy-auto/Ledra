-- Insert platform-level preset templates (scope = 'platform', tenant_id = NULL)
-- These are shared across all tenants and cannot be edited by franchisees.

INSERT INTO templates (scope, tenant_id, name, schema_json, layout_version)
VALUES
-- コーティング用
('platform', NULL, 'コーティング施工証明書', '{
  "version": 1,
  "sections": [
    {
      "title": "コーティング情報",
      "fields": [
        { "key": "coating_brand", "label": "ブランド", "type": "select", "options": ["LUMINUS","BLASK","FIREBALL","BULLET","KAISER","KUBEBOND","GTECHNIQ","CERAMIC PRO","IGL COATINGS","その他"], "required": true },
        { "key": "coating_product", "label": "製品名", "type": "text", "required": true },
        { "key": "layers", "label": "層数", "type": "select", "options": ["1層","2層","3層","4層","5層"], "required": true },
        { "key": "surface_prep", "label": "下地処理", "type": "select", "options": ["研磨（1工程）","研磨（2工程）","研磨（3工程）","脱脂のみ","なし"], "required": false },
        { "key": "施工面積", "label": "施工面積", "type": "select", "options": ["全面","ボディのみ","ホイール含む","部分施工"], "required": false }
      ]
    },
    {
      "title": "施工詳細",
      "fields": [
        { "key": "施工日", "label": "施工日", "type": "date", "required": true },
        { "key": "施工担当者", "label": "施工担当者", "type": "text", "required": false },
        { "key": "メンテナンス推奨", "label": "メンテナンス推奨", "type": "text", "required": false }
      ]
    }
  ]
}'::jsonb, 1),

-- PPF用
('platform', NULL, 'PPF施工証明書', '{
  "version": 1,
  "sections": [
    {
      "title": "フィルム情報",
      "fields": [
        { "key": "film_brand", "label": "フィルムブランド", "type": "select", "options": ["XPEL","3M","STEK","SunTek","HEXIS","その他"], "required": true },
        { "key": "film_type", "label": "フィルム種類", "type": "select", "options": ["Ultimate Plus","Supreme","Prime","マット","カラー","その他"], "required": true },
        { "key": "film_thickness", "label": "フィルム厚", "type": "select", "options": ["150μm","200μm","250μm","300μm","その他"], "required": false }
      ]
    },
    {
      "title": "施工部位",
      "fields": [
        { "key": "施工部位", "label": "施工部位", "type": "multiselect", "options": ["ボンネット","ルーフ","フロントフェンダー","リアフェンダー","ドア","サイドステップ","バンパー（前）","バンパー（後）","ミラー","ヘッドライト","フルラップ"], "required": true },
        { "key": "施工日", "label": "施工日", "type": "date", "required": true },
        { "key": "保証年数", "label": "保証年数", "type": "select", "options": ["1年","3年","5年","7年","10年","メーカー保証"], "required": false },
        { "key": "施工担当者", "label": "施工担当者", "type": "text", "required": false }
      ]
    }
  ]
}'::jsonb, 1),

-- 整備用
('platform', NULL, '整備記録証明書', '{
  "version": 1,
  "sections": [
    {
      "title": "整備情報",
      "fields": [
        { "key": "整備種別", "label": "整備種別", "type": "select", "options": ["法定12ヶ月点検","法定24ヶ月点検（車検）","一般整備","オイル交換","タイヤ交換","ブレーキ整備","その他"], "required": true },
        { "key": "走行距離", "label": "走行距離（km）", "type": "number", "required": true },
        { "key": "整備日", "label": "整備日", "type": "date", "required": true }
      ]
    },
    {
      "title": "作業内容",
      "fields": [
        { "key": "交換部品", "label": "交換部品", "type": "textarea", "required": false },
        { "key": "点検項目", "label": "点検項目・結果", "type": "textarea", "required": false },
        { "key": "整備士", "label": "整備士名", "type": "text", "required": false },
        { "key": "次回点検", "label": "次回点検推奨", "type": "text", "required": false }
      ]
    }
  ]
}'::jsonb, 1),

-- 鈑金用
('platform', NULL, '鈑金塗装証明書', '{
  "version": 1,
  "sections": [
    {
      "title": "修理情報",
      "fields": [
        { "key": "損傷箇所", "label": "損傷箇所", "type": "multiselect", "options": ["ボンネット","ルーフ","フロントフェンダー（右）","フロントフェンダー（左）","リアフェンダー（右）","リアフェンダー（左）","ドア（前右）","ドア（前左）","ドア（後右）","ドア（後左）","バンパー（前）","バンパー（後）","トランク","その他"], "required": true },
        { "key": "修理方法", "label": "修理方法", "type": "select", "options": ["鈑金修理","パネル交換","デントリペア","その他"], "required": true },
        { "key": "損傷原因", "label": "損傷原因", "type": "select", "options": ["事故","飛び石","経年劣化","その他"], "required": false }
      ]
    },
    {
      "title": "塗装情報",
      "fields": [
        { "key": "使用塗料", "label": "使用塗料", "type": "text", "required": false },
        { "key": "塗装面積", "label": "塗装面積", "type": "select", "options": ["パネル1枚","パネル2枚","パネル3枚以上","全塗装"], "required": false },
        { "key": "color_code", "label": "カラーコード", "type": "text", "required": false },
        { "key": "施工日", "label": "施工日", "type": "date", "required": true },
        { "key": "施工担当者", "label": "施工担当者", "type": "text", "required": false }
      ]
    }
  ]
}'::jsonb, 1)

ON CONFLICT DO NOTHING;
