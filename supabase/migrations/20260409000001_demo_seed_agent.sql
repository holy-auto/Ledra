-- =============================================================
-- Demo Seed: Agent Portal Demo Data
-- 代理店ポータル デモ用サンプルデータ
-- =============================================================
-- This migration inserts demo data for showcasing the agent portal.
-- It includes sample materials (営業資料) and signing requests (契約書).
-- A demo agent record is created with a fixed UUID so other seed
-- data can reference it. The Supabase Auth user must be created
-- separately (see scripts/setup-demo-agent.ts).
-- =============================================================

-- Demo agent UUID (fixed so it can be referenced by signing requests)
-- Supabase Auth user is linked in setup-demo-agent.ts
do $$ begin

  -- ─────────────────────────────────────────
  -- 1) Demo agent record
  -- ─────────────────────────────────────────
  insert into agents (
    id, name, slug, status,
    contact_name, contact_email, contact_phone,
    address,
    default_commission_rate, commission_type,
    notes
  ) values (
    '00000000-0000-0000-0000-de0000000001'::uuid,
    'デモ代理店株式会社',
    'demo-agent',
    'active',
    'デモ 太郎',
    'demo@agent.ledra.test',
    '03-0000-0000',
    '東京都千代田区デモ町1-2-3',
    10.00,
    'percentage',
    'デモ用アカウント — 本番運用では使用しないこと'
  )
  on conflict (id) do nothing;

  -- ─────────────────────────────────────────
  -- 2) Demo materials (営業資料)
  --    Shared with all agents (no agent_id col)
  --    storage_path is a placeholder — upload real
  --    files via Admin > 代理店向け資料管理
  -- ─────────────────────────────────────────

  -- Pinned: サービス紹介資料
  insert into agent_materials (
    id, category_id, title, description,
    file_name, file_size, file_type, storage_path,
    version, is_pinned, is_published, download_count
  )
  select
    '10000000-0000-0000-0000-000000000001'::uuid,
    amc.id,
    'Ledra 代理店向けサービス紹介資料',
    'Ledraのサービス概要・主な機能・導入メリットをまとめた代理店専用の提案書です。',
    'ledra_service_overview_v2.pdf',
    2457600,        -- 2.4 MB
    'application/pdf',
    'materials/demo/ledra_service_overview_v2.pdf',
    'v2.0',
    true,           -- pinned
    true,
    42
  from agent_material_categories amc
  where amc.slug = 'sales'
  on conflict (id) do nothing;

  -- 料金プラン
  insert into agent_materials (
    id, category_id, title, description,
    file_name, file_size, file_type, storage_path,
    version, is_pinned, is_published, download_count
  )
  select
    '10000000-0000-0000-0000-000000000002'::uuid,
    amc.id,
    'Ledra 料金プラン一覧',
    'Starter・Standard・Pro・Enterprise の各プランの機能比較と月額料金をまとめています。',
    'ledra_pricing_2026.pdf',
    819200,         -- 800 KB
    'application/pdf',
    'materials/demo/ledra_pricing_2026.pdf',
    '2026年版',
    false,
    true,
    28
  from agent_material_categories amc
  where amc.slug = 'sales'
  on conflict (id) do nothing;

  -- Pinned: 代理店契約書テンプレート
  insert into agent_materials (
    id, category_id, title, description,
    file_name, file_size, file_type, storage_path,
    version, is_pinned, is_published, download_count
  )
  select
    '10000000-0000-0000-0000-000000000003'::uuid,
    amc.id,
    '代理店契約書テンプレート',
    '代理店契約締結時に使用する標準契約書のテンプレートです。記入例付き。',
    'agent_contract_template.pdf',
    307200,         -- 300 KB
    'application/pdf',
    'materials/demo/agent_contract_template.pdf',
    'Rev.3',
    true,           -- pinned
    true,
    15
  from agent_material_categories amc
  where amc.slug = 'contracts'
  on conflict (id) do nothing;

  -- サービス利用規約
  insert into agent_materials (
    id, category_id, title, description,
    file_name, file_size, file_type, storage_path,
    version, is_pinned, is_published, download_count
  )
  select
    '10000000-0000-0000-0000-000000000004'::uuid,
    amc.id,
    'Ledra サービス利用規約（代理店向け）',
    'お客様への提示・説明用のサービス利用規約の最新版です。',
    'ledra_tos_agent_2026.pdf',
    512000,         -- 500 KB
    'application/pdf',
    'materials/demo/ledra_tos_agent_2026.pdf',
    null,
    false,
    true,
    9
  from agent_material_categories amc
  where amc.slug = 'contracts'
  on conflict (id) do nothing;

  -- 代理店ポータル操作マニュアル
  insert into agent_materials (
    id, category_id, title, description,
    file_name, file_size, file_type, storage_path,
    version, is_pinned, is_published, download_count
  )
  select
    '10000000-0000-0000-0000-000000000005'::uuid,
    amc.id,
    '代理店ポータル 操作マニュアル',
    '代理店ポータルの各機能（紹介登録・コミッション確認・資料ダウンロード等）の操作方法を解説しています。',
    'agent_portal_manual_v1.pdf',
    3670016,        -- 3.5 MB
    'application/pdf',
    'materials/demo/agent_portal_manual_v1.pdf',
    'v1.2',
    false,
    true,
    33
  from agent_material_categories amc
  where amc.slug = 'manuals'
  on conflict (id) do nothing;

  -- 顧客向けパンフレット
  insert into agent_materials (
    id, category_id, title, description,
    file_name, file_size, file_type, storage_path,
    version, is_pinned, is_published, download_count
  )
  select
    '10000000-0000-0000-0000-000000000006'::uuid,
    amc.id,
    '顧客向けパンフレット（A4・カラー）',
    '店舗窓口でお客様にお渡しいただける施工証明書サービスの紹介パンフレットです。印刷用高解像度版。',
    'ledra_pamphlet_customer_a4.pdf',
    5242880,        -- 5 MB
    'application/pdf',
    'materials/demo/ledra_pamphlet_customer_a4.pdf',
    null,
    false,
    true,
    67
  from agent_material_categories amc
  where amc.slug = 'promotional'
  on conflict (id) do nothing;

  -- SNS用バナー素材
  insert into agent_materials (
    id, category_id, title, description,
    file_name, file_size, file_type, storage_path,
    version, is_pinned, is_published, download_count
  )
  select
    '10000000-0000-0000-0000-000000000007'::uuid,
    amc.id,
    'SNS・Web 用バナー素材一式',
    'Instagram / LINE / Web サイト向けバナー素材のセット（PNG各サイズ・テキスト入り／なし）。',
    'ledra_banner_sns_pack.zip',
    10485760,       -- 10 MB
    'application/zip',
    'materials/demo/ledra_banner_sns_pack.zip',
    '2026春版',
    false,
    true,
    21
  from agent_material_categories amc
  where amc.slug = 'promotional'
  on conflict (id) do nothing;

  -- 研修テキスト
  insert into agent_materials (
    id, category_id, title, description,
    file_name, file_size, file_type, storage_path,
    version, is_pinned, is_published, download_count
  )
  select
    '10000000-0000-0000-0000-000000000008'::uuid,
    amc.id,
    '代理店研修テキスト 第1回：Ledraの特徴と差別化ポイント',
    '代理店担当者向けの研修資料。Ledraのサービス概要・競合との違い・よくある質問への答え方を学びます。',
    'training_01_overview.pdf',
    2097152,        -- 2 MB
    'application/pdf',
    'materials/demo/training_01_overview.pdf',
    null,
    false,
    true,
    11
  from agent_material_categories amc
  where amc.slug = 'training'
  on conflict (id) do nothing;

  -- ─────────────────────────────────────────
  -- 3) Demo signing requests (契約書)
  --    Linked to the demo agent
  -- ─────────────────────────────────────────

  -- 署名完了: 代理店基本契約書
  insert into agent_signing_requests (
    id, agent_id, template_type, title,
    cloudsign_document_id,
    status,
    signer_email, signer_name,
    sent_at, signed_at
  ) values (
    '20000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-de0000000001'::uuid,
    'agent_contract',
    '代理店基本契約書 2026年1月締結',
    'demo-cloudsign-doc-001',
    'signed',
    'demo@agent.ledra.test',
    'デモ 太郎',
    now() - interval '90 days',
    now() - interval '88 days'
  )
  on conflict (id) do nothing;

  -- 署名待ち: NDA
  insert into agent_signing_requests (
    id, agent_id, template_type, title,
    cloudsign_document_id,
    status,
    signer_email, signer_name,
    sent_at, signed_at
  ) values (
    '20000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-de0000000001'::uuid,
    'nda',
    '秘密保持契約書（NDA）2026年4月',
    'demo-cloudsign-doc-002',
    'sent',
    'demo@agent.ledra.test',
    'デモ 太郎',
    now() - interval '2 days',
    null
  )
  on conflict (id) do nothing;

  -- 閲覧済み: 追加サービス利用契約
  insert into agent_signing_requests (
    id, agent_id, template_type, title,
    cloudsign_document_id,
    status,
    signer_email, signer_name,
    sent_at, signed_at
  ) values (
    '20000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-de0000000001'::uuid,
    'other',
    '追加サービス利用契約書（オプション機能）',
    'demo-cloudsign-doc-003',
    'viewed',
    'demo@agent.ledra.test',
    'デモ 太郎',
    now() - interval '5 days',
    null
  )
  on conflict (id) do nothing;

end $$;
