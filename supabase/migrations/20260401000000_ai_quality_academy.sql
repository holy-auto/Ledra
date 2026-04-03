-- ============================================================
-- AI品質管理・Ledra Academy 基盤マイグレーション
-- Phase1: standard_rules (B-3 抜け漏れ検知)
-- Phase2: follow_up_settings拡張 (B-4 追加トリガー)
-- Phase3: academy_cases, knowledge_chunks (C-1, C-3)
-- ============================================================

-- ─────────────────────────────────────────────
-- Phase1: Ledra Standard ルールテーブル
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS standard_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category         text NOT NULL,          -- 'ppf','coating','body_repair','maintenance','glass','other'
  category_label   text NOT NULL,          -- 表示名
  required_photos  jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_fields  jsonb NOT NULL DEFAULT '[]'::jsonb,
  warning_rules    jsonb NOT NULL DEFAULT '[]'::jsonb,
  standard_level   text NOT NULL DEFAULT 'basic', -- 'basic','standard','pro'
  version          int  NOT NULL DEFAULT 1,
  is_active        bool NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_standard_rules_category ON standard_rules(category);

-- 初期データ: PPF
INSERT INTO standard_rules (category, category_label, standard_level, required_photos, required_fields, warning_rules) VALUES
('ppf', 'PPFフィルム', 'standard',
 '[
   {"id":"before_full","label":"施工前・全体（正面）","required":true,"count_min":1,"validation":"車両全体が映っていること","angle_hint":"正面から5m程度"},
   {"id":"before_detail","label":"施工前・細部（傷・汚れ確認）","required":true,"count_min":2,"validation":"既存の傷・へこみが確認できること"},
   {"id":"during_apply","label":"施工中（フィルム貼付）","required":false,"standard_level":"standard","count_min":1},
   {"id":"after_full","label":"施工後・全体","required":true,"count_min":1,"validation":"施工範囲が明確に写っていること"},
   {"id":"after_detail","label":"施工後・細部","required":true,"count_min":2,"validation":"仕上がりが確認できること"}
 ]'::jsonb,
 '[
   {"key":"material_name","label":"使用フィルム銘柄","required":true},
   {"key":"material_thickness","label":"厚さ(μm)","required":true},
   {"key":"warranty_period","label":"保証期間","required":true},
   {"key":"work_area","label":"施工箇所","required":true},
   {"key":"material_maker","label":"メーカー名","required":false,"standard_level":"standard"}
 ]'::jsonb,
 '[
   {"condition":"photo_count_lt_4","level":"error","message":"PPF施工には最低4枚の写真が必要です"},
   {"condition":"no_before_photo","level":"error","message":"施工前写真がありません。後で保険査定に必要になる場合があります"},
   {"condition":"material_name_missing","level":"error","message":"使用フィルム銘柄が未記載です。製品名・メーカーを明記してください"},
   {"condition":"material_name_ambiguous","level":"warning","message":"材料名が曖昧です。型番や規格も記載することを推奨します"},
   {"condition":"warranty_missing","level":"error","message":"保証期間が未設定です"}
 ]'::jsonb),

-- 初期データ: コーティング
('coating', 'ボディコーティング', 'basic',
 '[
   {"id":"before_full","label":"施工前・全体","required":true,"count_min":1},
   {"id":"after_full","label":"施工後・全体","required":true,"count_min":1},
   {"id":"after_gloss","label":"施工後・光沢確認","required":false,"standard_level":"standard","count_min":1}
 ]'::jsonb,
 '[
   {"key":"coating_product","label":"コーティング剤名","required":true},
   {"key":"warranty_period","label":"保証期間","required":true},
   {"key":"work_layers","label":"施工層数","required":false,"standard_level":"standard"}
 ]'::jsonb,
 '[
   {"condition":"photo_count_lt_2","level":"error","message":"コーティング施工には最低2枚の写真（施工前後）が必要です"},
   {"condition":"coating_product_missing","level":"error","message":"コーティング剤名が未記載です"},
   {"condition":"warranty_missing","level":"warning","message":"保証期間が未設定です"}
 ]'::jsonb),

-- 初期データ: ボディリペア
('body_repair', 'ボディリペア', 'standard',
 '[
   {"id":"damage_before","label":"損傷部位（施工前）","required":true,"count_min":2,"validation":"損傷箇所が明確に確認できること"},
   {"id":"during_repair","label":"修正中","required":false,"standard_level":"standard","count_min":1},
   {"id":"color_matching","label":"色合わせ記録","required":false,"standard_level":"standard","count_min":1},
   {"id":"after_repair","label":"修正後","required":true,"count_min":2,"validation":"修正結果が確認できること"},
   {"id":"after_full","label":"施工後・全体","required":true,"count_min":1}
 ]'::jsonb,
 '[
   {"key":"damage_location","label":"損傷部位","required":true},
   {"key":"color_code","label":"塗装色番号","required":true},
   {"key":"repair_method","label":"修理方法","required":false,"standard_level":"standard"}
 ]'::jsonb,
 '[
   {"condition":"no_before_photo","level":"error","message":"損傷部位の施工前写真がありません"},
   {"condition":"color_code_missing","level":"error","message":"塗装色番号が未記載です。色合わせの根拠として必要です"},
   {"condition":"photo_count_lt_3","level":"warning","message":"ボディリペアには最低3枚の写真を推奨します"}
 ]'::jsonb);

-- ─────────────────────────────────────────────
-- Phase1: AI写真チェック結果キャッシュ
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificate_quality_scores (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id     uuid NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  tenant_id          uuid NOT NULL,
  overall_status     text NOT NULL DEFAULT 'pending', -- 'pass','warning','fail','pending'
  standard_level     text,                             -- 'none','basic','standard','pro'
  score              int  NOT NULL DEFAULT 0,          -- 0-100
  photo_results      jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_photos     jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_fields     jsonb NOT NULL DEFAULT '[]'::jsonb,
  warning_messages   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_checked_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(certificate_id)
);

CREATE INDEX IF NOT EXISTS idx_cert_quality_tenant ON certificate_quality_scores(tenant_id);

-- ─────────────────────────────────────────────
-- Phase3-C1: Academy 事例テーブル
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id   uuid REFERENCES certificates(id) ON DELETE SET NULL,
  tenant_id        uuid NOT NULL,
  category         text NOT NULL,
  difficulty       int  NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  quality_score    int  NOT NULL DEFAULT 0,
  tags             text[] NOT NULL DEFAULT '{}',
  ai_summary       text,
  good_points      jsonb NOT NULL DEFAULT '[]'::jsonb,
  caution_points   jsonb NOT NULL DEFAULT '[]'::jsonb,
  vehicle_info     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- 匿名化済み車両情報
  photos           jsonb NOT NULL DEFAULT '[]'::jsonb,  -- 匿名化済み写真URL
  is_candidate     bool NOT NULL DEFAULT false,  -- 自動候補フラグ
  is_published     bool NOT NULL DEFAULT false,  -- Academy公開済み
  published_by     uuid,
  published_at     timestamptz,
  anonymized       bool NOT NULL DEFAULT false,
  view_count       int  NOT NULL DEFAULT 0,
  helpful_count    int  NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academy_cases_category    ON academy_cases(category);
CREATE INDEX IF NOT EXISTS idx_academy_cases_published   ON academy_cases(is_published);
CREATE INDEX IF NOT EXISTS idx_academy_cases_score       ON academy_cases(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_academy_cases_candidate   ON academy_cases(is_candidate) WHERE is_candidate = true;

-- ─────────────────────────────────────────────
-- Phase3-C3: ナレッジチャンク (RAG用)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type  text NOT NULL, -- 'case','manual','maker_doc'
  source_id    uuid,
  content      text NOT NULL,
  category     text,
  tags         text[] NOT NULL DEFAULT '{}',
  tenant_id    uuid,           -- null = 全加盟店共有
  is_active    bool NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_source     ON knowledge_chunks(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category   ON knowledge_chunks(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_tenant     ON knowledge_chunks(tenant_id);

-- ─────────────────────────────────────────────
-- Phase3-C4: Academy 学習進捗テーブル
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_progress (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  user_id          uuid NOT NULL,
  level            int  NOT NULL DEFAULT 1,
  total_score      int  NOT NULL DEFAULT 0,
  certs_reviewed   int  NOT NULL DEFAULT 0,
  cases_submitted  int  NOT NULL DEFAULT 0,
  badges           text[] NOT NULL DEFAULT '{}',
  standard_level   text NOT NULL DEFAULT 'none', -- 'none','basic','standard','pro'
  last_activity_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_academy_progress_tenant ON academy_progress(tenant_id);
CREATE INDEX IF NOT EXISTS idx_academy_progress_score  ON academy_progress(total_score DESC);

-- ─────────────────────────────────────────────
-- Phase2-B4: follow_up_settings 拡張
-- 追加トリガー設定カラム
-- ─────────────────────────────────────────────
ALTER TABLE follow_up_settings
  ADD COLUMN IF NOT EXISTS send_on_issue       bool NOT NULL DEFAULT false,  -- 発行直後
  ADD COLUMN IF NOT EXISTS first_reminder_days int  NOT NULL DEFAULT 30,     -- 初回フォロー
  ADD COLUMN IF NOT EXISTS warranty_end_days   int  NOT NULL DEFAULT 60,     -- 保証終了前
  ADD COLUMN IF NOT EXISTS inspection_pre_days int  NOT NULL DEFAULT 60,     -- 車検前
  ADD COLUMN IF NOT EXISTS seasonal_enabled    bool NOT NULL DEFAULT false;  -- 季節提案

-- ─────────────────────────────────────────────
-- RLS ポリシー
-- ─────────────────────────────────────────────
ALTER TABLE standard_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "standard_rules_read_all" ON standard_rules FOR SELECT USING (true);
CREATE POLICY "standard_rules_admin_write" ON standard_rules FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE certificate_quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quality_scores_tenant" ON certificate_quality_scores
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE academy_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_cases_read_published" ON academy_cases FOR SELECT USING (is_published = true);
CREATE POLICY "academy_cases_tenant_all"     ON academy_cases FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_read" ON knowledge_chunks FOR SELECT
  USING (is_active = true AND (tenant_id IS NULL OR
    tenant_id = (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid() LIMIT 1)));

ALTER TABLE academy_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_progress_tenant" ON academy_progress FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid() LIMIT 1));
