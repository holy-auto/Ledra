-- Equipment master table for BtoB vehicle features/options picker
CREATE TABLE IF NOT EXISTS equipment_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,  -- NULL = system-wide preset
  category text NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, category, name)
);

-- Enable RLS
ALTER TABLE equipment_master ENABLE ROW LEVEL SECURITY;

-- Read: system presets (tenant_id IS NULL) + own tenant items
CREATE POLICY "read_equipment" ON equipment_master
  FOR SELECT USING (
    tenant_id IS NULL
    OR tenant_id = (
      SELECT tm.tenant_id FROM tenant_memberships tm
      WHERE tm.user_id = auth.uid()
      LIMIT 1
    )
  );

-- Insert: only for own tenant
CREATE POLICY "insert_equipment" ON equipment_master
  FOR INSERT WITH CHECK (
    tenant_id = (
      SELECT tm.tenant_id FROM tenant_memberships tm
      WHERE tm.user_id = auth.uid()
      LIMIT 1
    )
  );

-- Seed system-wide presets (tenant_id = NULL)
INSERT INTO equipment_master (tenant_id, category, name, sort_order) VALUES
  -- safety (安全装備)
  (NULL, 'safety', 'ABS', 1),
  (NULL, 'safety', 'ESC（横滑り防止）', 2),
  (NULL, 'safety', '運転席エアバッグ', 3),
  (NULL, 'safety', '助手席エアバッグ', 4),
  (NULL, 'safety', 'サイドエアバッグ', 5),
  (NULL, 'safety', 'カーテンエアバッグ', 6),
  (NULL, 'safety', '衝突被害軽減ブレーキ', 7),
  (NULL, 'safety', 'レーンキープアシスト', 8),
  (NULL, 'safety', 'ブラインドスポットモニター', 9),
  (NULL, 'safety', '360度カメラ', 10),
  (NULL, 'safety', 'バックカメラ', 11),
  (NULL, 'safety', 'パーキングセンサー', 12),
  (NULL, 'safety', 'クルーズコントロール', 13),
  (NULL, 'safety', 'アダプティブクルーズコントロール', 14),
  -- comfort (快適装備)
  (NULL, 'comfort', 'エアコン', 1),
  (NULL, 'comfort', 'オートエアコン', 2),
  (NULL, 'comfort', 'デュアルエアコン', 3),
  (NULL, 'comfort', 'パワーステアリング', 4),
  (NULL, 'comfort', 'パワーウィンドウ', 5),
  (NULL, 'comfort', 'スマートキー', 6),
  (NULL, 'comfort', 'プッシュスタート', 7),
  (NULL, 'comfort', '電動パーキングブレーキ', 8),
  (NULL, 'comfort', 'シートヒーター', 9),
  (NULL, 'comfort', 'ベンチレーションシート', 10),
  (NULL, 'comfort', '電動シート', 11),
  (NULL, 'comfort', '本革シート', 12),
  (NULL, 'comfort', 'ハーフレザーシート', 13),
  (NULL, 'comfort', 'サンルーフ', 14),
  (NULL, 'comfort', 'パノラマルーフ', 15),
  (NULL, 'comfort', 'ステアリングヒーター', 16),
  -- entertainment (AV・ナビ)
  (NULL, 'entertainment', '純正ナビ', 1),
  (NULL, 'entertainment', '社外ナビ', 2),
  (NULL, 'entertainment', 'ディスプレイオーディオ', 3),
  (NULL, 'entertainment', 'フルセグTV', 4),
  (NULL, 'entertainment', 'ワンセグTV', 5),
  (NULL, 'entertainment', 'ETC', 6),
  (NULL, 'entertainment', 'ETC2.0', 7),
  (NULL, 'entertainment', 'Bluetooth', 8),
  (NULL, 'entertainment', 'USB端子', 9),
  (NULL, 'entertainment', 'Apple CarPlay', 10),
  (NULL, 'entertainment', 'Android Auto', 11),
  (NULL, 'entertainment', 'CD', 12),
  (NULL, 'entertainment', 'DVD', 13),
  (NULL, 'entertainment', 'フリップダウンモニター', 14),
  (NULL, 'entertainment', 'ヘッドアップディスプレイ', 15),
  -- exterior (外装)
  (NULL, 'exterior', 'アルミホイール', 1),
  (NULL, 'exterior', 'LEDヘッドライト', 2),
  (NULL, 'exterior', 'HIDヘッドライト', 3),
  (NULL, 'exterior', 'フォグランプ', 4),
  (NULL, 'exterior', 'ルーフレール', 5),
  (NULL, 'exterior', 'リアスポイラー', 6),
  (NULL, 'exterior', 'エアロパーツ', 7),
  (NULL, 'exterior', 'ドアバイザー', 8),
  (NULL, 'exterior', '電動格納ミラー', 9),
  (NULL, 'exterior', 'ウインカーミラー', 10),
  -- interior (内装)
  (NULL, 'interior', 'ウォークスルー', 1),
  (NULL, 'interior', 'ベンチシート', 2),
  (NULL, 'interior', '3列シート', 3),
  (NULL, 'interior', 'オットマン', 4),
  (NULL, 'interior', 'アームレスト', 5),
  (NULL, 'interior', 'ドライブレコーダー', 6),
  (NULL, 'interior', 'フロアマット', 7),
  (NULL, 'interior', 'シートカバー', 8)
ON CONFLICT (tenant_id, category, name) DO NOTHING;
