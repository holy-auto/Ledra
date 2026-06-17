-- =============================================================
-- Agent Materials — Customer Info Template Support
-- 提案用カバーシート（顧客情報差し込み）のテンプレート設定
-- =============================================================
-- Adds per-material template metadata so the agent portal can render
-- a personalized cover sheet (会社名・担当者名・提案日・メモ) in front
-- of営業系/顧客向け資料.
-- =============================================================

-- Add template support columns
alter table agent_materials
  add column if not exists has_template boolean not null default false,
  add column if not exists template_fields jsonb not null default '[]'::jsonb;

-- Enable templates for appropriate existing materials (営業系+顧客向けのみ)
update agent_materials set
  has_template = true,
  template_fields = '[
    {"key":"company_name","label":"会社名","required":true,"placeholder":"株式会社○○"},
    {"key":"contact_name","label":"担当者名","required":true,"placeholder":"山田 太郎"},
    {"key":"proposal_date","label":"提案日","required":false,"type":"date"},
    {"key":"memo","label":"メモ・一言添え","required":false,"type":"textarea"}
  ]'::jsonb
where id in (
  '10000000-0000-0000-0000-000000000001'::uuid,  -- サービス紹介資料
  '10000000-0000-0000-0000-000000000002'::uuid,  -- 料金プラン
  '10000000-0000-0000-0000-000000000006'::uuid   -- 顧客向けパンフレット
);
