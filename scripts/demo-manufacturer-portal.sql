-- =============================================================
-- メーカーポータル デモデータ（デモ用メーカー de0000000200 専用）
-- =============================================================
-- 目的: デモ用メーカーのアカウント（demo@manufacturer.ledra.test）で、
--       ポータルの全ページ・全項目に中身が出るようにする。
--
-- 前提:
--   - 20260514120000_demo_seed_manufacturer.sql（デモ用メーカーとテンプレート）
--   - scripts/setup-demo-manufacturer.ts（デモ用メーカーのアカウント）
--   - scripts/setup-demo-tenant.ts（デモ施工店 Ledra Motors と証明書 LEDRA-DEMO-*）
--
-- 実行: Supabase の SQL エディタ（または MCP の execute_sql）でこのファイルを丸ごと流す。
--       何度流しても同じ状態になる。実証テストの行はデモ用メーカーの分を消してから作り直すので、
--       デモ中に画面から足した実証テストのデータも消える。
--       setup-demo-tenant.ts を流し直すと証明書の service_type が元に戻るので、その後にもう一度流す。
--
-- 触るもの（デモ用メーカー・デモ施工店の行だけ）:
--   manufacturer_templates / manufacturer_certified_tenants / manufacturer_notifications /
--   ft_*（デモ用メーカーの分）/ workshop_capability_profiles（デモ施工店の分）/
--   certificates（デモ施工店の LEDRA-DEMO-0001〜0016 のうち下の一覧と、写真の無いデモ証明書2件）
--   撮影用のヒーロー証明書 LEDRA-DEMO-0017〜0027 は触らない。
--
-- 戻し方: scripts/demo-manufacturer-portal-reset.sql
--
-- ponytail: 施工店はデモ施工店1店だけ。本番の tenants にデモ店を増やすと、運営画面の集計や
--   メールを送る cron（オンボーディング追客・請求）に載るため増やさない。
--   そのため「認定解除」「応募の却下」など2店目が要る表示は出せない。
-- =============================================================

do $$
declare
  m   constant uuid := '00000000-0000-0000-0000-de0000000200';  -- デモ用メーカー
  t   constant uuid := '00000000-0000-0000-0000-de0000000010';  -- デモ施工店 Ledra Motors
  tpl_coat constant uuid := '00000000-0000-0000-0000-de0000000201';
  tpl_ppf  constant uuid := '00000000-0000-0000-0000-de0210000002';
  tpl_old  constant uuid := '00000000-0000-0000-0000-de0210000003';
  p1 constant uuid := '00000000-0000-0000-0000-de0220000001';  -- 実施中
  p2 constant uuid := '00000000-0000-0000-0000-de0220000002';  -- 募集中
  p3 constant uuid := '00000000-0000-0000-0000-de0220000003';  -- 完了
  p4 constant uuid := '00000000-0000-0000-0000-de0220000004';  -- 下書き
  p5 constant uuid := '00000000-0000-0000-0000-de0220000005';  -- アーカイブ
  r1 constant uuid := '00000000-0000-0000-0000-de0230000001';
  r2 constant uuid := '00000000-0000-0000-0000-de0230000002';
  r3 constant uuid := '00000000-0000-0000-0000-de0230000003';
  r4 constant uuid := '00000000-0000-0000-0000-de0230000004';
  c1 constant uuid := '00000000-0000-0000-0000-de0260000001';
  c2 constant uuid := '00000000-0000-0000-0000-de0260000002';
  c3 constant uuid := '00000000-0000-0000-0000-de0260000003';
  c4 constant uuid := '00000000-0000-0000-0000-de0260000004';
  c5 constant uuid := '00000000-0000-0000-0000-de0260000005';
  tm1 constant uuid := '00000000-0000-0000-0000-de0240000001';
  tm2 constant uuid := '00000000-0000-0000-0000-de0240000002';
  tm3 constant uuid := '00000000-0000-0000-0000-de0240000003';
  j1 constant uuid := '00000000-0000-0000-0000-de0270000001';
  j2 constant uuid := '00000000-0000-0000-0000-de0270000002';
  j3 constant uuid := '00000000-0000-0000-0000-de0270000003';
  j4 constant uuid := '00000000-0000-0000-0000-de0270000004';
  j5 constant uuid := '00000000-0000-0000-0000-de0270000005';
  j6 constant uuid := '00000000-0000-0000-0000-de0270000006';
  j7 constant uuid := '00000000-0000-0000-0000-de0270000007';
  j8 constant uuid := '00000000-0000-0000-0000-de0270000008';
  j9 constant uuid := '00000000-0000-0000-0000-de0270000009';
  mfr_admin uuid;
  tenant_owner uuid;
  snap jsonb;
begin
  if not exists (select 1 from manufacturers where id = m) then
    raise exception 'デモ用メーカー % が無い（20260514120000_demo_seed_manufacturer.sql を先に適用）', m;
  end if;
  if not exists (select 1 from tenants where id = t) then
    raise exception 'デモ施工店 % が無い（scripts/setup-demo-tenant.ts を先に実行）', t;
  end if;

  select user_id into mfr_admin from manufacturer_memberships
    where manufacturer_id = m and role = 'admin' and is_active order by created_at limit 1;
  select user_id into tenant_owner from tenant_memberships
    where tenant_id = t order by (role = 'owner') desc limit 1;

  -- ─── デザインテンプレート（公開2・非公開1）──────────────────────
  insert into manufacturer_templates (id, manufacturer_id, name, description, service_type, config_json, layout_key, is_active, sort_order)
  values
    (tpl_ppf, m, 'デモ PPF スタンダード', 'プロテクションフィルム用。施工パネルとフィルム種別を必須項目にしたデザイン。', 'ppf',
     (select config_json from manufacturer_templates where id = tpl_coat) || '{"header":{"title":"プロテクションフィルム 施工証明書","subtitle":"デモコーティング工業 認定施工店発行","show_issue_date":true,"show_certificate_no":true}}'::jsonb,
     'standard', true, 2),
    (tpl_old, m, '旧デザイン（2025年版）', '2025年まで使っていたデザイン。新規発行では選べない（非公開）。', 'coating',
     (select config_json from manufacturer_templates where id = tpl_coat),
     'standard', false, 9)
  on conflict (id) do update set name = excluded.name, description = excluded.description, service_type = excluded.service_type,
    config_json = excluded.config_json, is_active = excluded.is_active, sort_order = excluded.sort_order;

  -- ─── 認定施工店 ──────────────────────────────────────────────
  insert into manufacturer_certified_tenants (manufacturer_id, tenant_id, status, notes, certified_at, certified_by, revoked_at, revoked_by)
  values (m, t, 'active', '2026年5月 認定講習修了（技術部 山田講師）。年1回の技術確認あり。', '2026-05-20 10:00+09', mfr_admin, null, null)
  on conflict (manufacturer_id, tenant_id) do update set status = 'active', notes = excluded.notes,
    certified_at = excluded.certified_at, certified_by = excluded.certified_by, revoked_at = null, revoked_by = null;

  -- ─── 証明書（デモ施工店の既存デモ証明書にメーカー指定デザインを付ける）───────
  -- コーティング系 → デモ プレミアム コーティング。使用製品にロット番号を入れ、保証期間を付ける
  update certificates c set
    manufacturer_id = m,
    manufacturer_template_id = tpl_coat,
    service_type = 'coating',
    coating_products_json = jsonb_build_array(jsonb_build_object(
      'location', 'ボディ全面', 'brand_id', null, 'brand_name', 'デモコーティング工業',
      'product_id', null, 'product_name', v.product, 'product_code', v.code, 'lot_number', v.lot)),
    warranty_period_end = case when v.warranty then (c.created_at + interval '5 years')::date else c.warranty_period_end end
  from (values
    ('LEDRA-DEMO-0001', 'デモ プレミアム コーティング 9H', 'DPC-9H', 'DPC-2607-A', true),
    ('LEDRA-DEMO-0002', 'デモ セラミック EX', 'DCE-01', 'DCE-2607-B', true),
    ('LEDRA-DEMO-0004', 'デモ プレミアム コーティング 9H', 'DPC-9H', 'DPC-2608-A', true),
    ('LEDRA-DEMO-0008', 'デモ プレミアム コーティング 9H', 'DPC-9H', 'DPC-2608-C', false),  -- 保証なし（品質チェックの例）
    ('LEDRA-DEMO-0010', 'デモ セラミック EX', 'DCE-01', 'DCE-2609-A', true),
    ('LEDRA-DEMO-0011', 'デモ プレミアム コーティング 9H', 'DPC-9H', 'DPC-2609-B', true),
    ('LEDRA-DEMO-0015', 'デモ セラミック EX', 'DCE-01', 'DCE-2609-A', true),
    ('LEDRA-DEMO-0016', 'デモ プレミアム コーティング 9H', 'DPC-9H', 'DPC-2609-B', false)   -- 保証なし（品質チェックの例）
  ) as v(public_id, product, code, lot, warranty)
  where c.tenant_id = t and c.public_id = v.public_id;

  -- PPF → デモ PPF スタンダード
  update certificates c set
    manufacturer_id = m,
    manufacturer_template_id = tpl_ppf,
    service_type = 'ppf',
    ppf_coverage_json = v.coverage,
    coating_products_json = jsonb_build_array(jsonb_build_object(
      'location', 'フロント', 'brand_id', null, 'brand_name', 'デモコーティング工業',
      'product_id', null, 'product_name', 'デモ PPF グロス', 'product_code', 'DPF-G', 'lot_number', v.lot, 'film_type', 'gloss')),
    warranty_period_end = (c.created_at + interval '3 years')::date
  from (values
    ('LEDRA-DEMO-0003', 'DPF-2608-A', '[{"panel":"ヘッドライト（左右）","coverage":"full"}]'::jsonb),
    ('LEDRA-DEMO-0012', 'DPF-2609-A', '[{"panel":"フロントバンパー","coverage":"full"},{"panel":"ボンネット","coverage":"partial","partial_note":"先端30cmのみ"},{"panel":"ドアミラー（左右）","coverage":"full"}]'::jsonb)
  ) as v(public_id, lot, coverage)
  where c.tenant_id = t and c.public_id = v.public_id;

  -- 写真の無いデモ証明書2件 → 品質チェックの「写真なし」の例
  update certificates set manufacturer_id = m, manufacturer_template_id = tpl_coat
  where tenant_id = t and public_id in ('fR9X9ZPKOXGFG1asCV0wH-', '5it0nC4uWGZ-uzufZpbvBe');

  -- ─── 実証テスト（デモ用メーカーの分を作り直す。子の行は外部キーの cascade で消える）──
  delete from ft_projects where manufacturer_id = m;

  insert into ft_projects (id, manufacturer_id, name, description, product_name, product_spec, budget, target_units, conditions, status, starts_at, ends_at, created_by, created_at)
  values
    (p1, m, '新製品「デモ セラミック EX」実証テスト',
     '発売前のセラミックコーティング剤を、認定施工店で実車に施工して評価する。施工性・仕上がり・初期の撥水を確認し、量産仕様を確定する。',
     'デモ セラミック EX', '{"硬度":"9H","膜厚":"約1.5µm","硬化時間":"24時間","想定耐久":"5年"}', 3000000, 30,
     '{"気温":"10〜35℃","湿度":"80%以下","下地":"脱脂・鉄粉除去済み"}', 'active', '2026-08-01', '2026-11-30', mfr_admin, '2026-07-10 10:00+09'),
    (p2, m, '冬季の施工性テスト（低温環境）',
     '気温5〜10℃での施工性と硬化時間を確認する。2026年12月から実施予定で、参加施工店を募集中。',
     'デモ プレミアム コーティング 9H', '{"硬度":"9H","推奨施工温度":"5〜35℃"}', 1200000, 10,
     '{"気温":"5〜10℃"}', 'recruiting', '2026-12-01', '2027-02-28', mfr_admin, '2026-09-20 10:00+09'),
    (p3, m, 'ガラス系コーティング 2025 改良版 検証',
     '2025年改良版の撥水持続を半年間検証した。結果は量産仕様に反映済み。',
     'デモ プレミアム コーティング 9H（2025改良）', '{"硬度":"9H"}', 800000, 8,
     '{}', 'completed', '2025-10-01', '2026-03-31', mfr_admin, '2025-09-01 10:00+09'),
    (p4, m, 'ホイール用コーティング 実証テスト（準備中）',
     '募集要項と施工条件を準備中。', 'デモ ホイールコート', '{}', null, 12,
     '{}', 'draft', null, null, mfr_admin, '2026-10-01 10:00+09'),
    (p5, m, '旧製品 撥水トップコート 比較テスト',
     '2024年に実施した比較テスト。参照用に残している。', 'デモ トップコート（旧）', '{}', 500000, 5,
     '{}', 'archived', '2024-04-01', '2024-09-30', mfr_admin, '2024-03-01 10:00+09');

  -- 募集
  insert into ft_recruitments (id, project_id, manufacturer_id, title, description, required_certifications, max_participants, deadline, is_open, created_at)
  values
    (r1, p1, m, 'デモ セラミック EX 実証テスト 参加施工店募集', '認定施工店のうち、月10台以上のコーティング施工がある店舗を対象とする。施工材料はメーカー支給。',
     '{"デモコーティング工業 認定施工店"}', 10, '2026-07-31 23:59+09', false, '2026-07-10 10:00+09'),
    (r2, p2, m, '冬季テスト 参加施工店募集（寒冷地優先）', '屋内ブースまたは屋外で低温施工ができる施工店を募集。施工1台あたり協力金あり。',
     '{"デモコーティング工業 認定施工店"}', 6, '2026-11-15 23:59+09', true, '2026-09-20 10:00+09'),
    (r3, p3, m, '2025 改良版 検証 一次募集', '半年間の経過観察に協力できる施工店。', '{}', 6, '2025-09-20 23:59+09', false, '2025-09-01 10:00+09'),
    (r4, p3, m, '2025 改良版 検証 追加募集', '一次募集の追加枠。', '{}', 2, '2025-10-20 23:59+09', false, '2025-10-01 10:00+09');

  -- 応募（デモ施工店1店なので、募集ごとに状態を変えて見せる）
  insert into ft_applications (recruitment_id, project_id, manufacturer_id, tenant_id, applied_by, status, notes, review_notes, reviewed_by, reviewed_at, created_at)
  values
    (r1, p1, m, t, tenant_owner, 'approved', '月15台前後のコーティング施工あり。屋内ブース2基。', '施工実績・設備ともに条件を満たす。承認。', mfr_admin, '2026-07-25 15:00+09', '2026-07-15 11:00+09'),
    (r2, p2, m, t, tenant_owner, 'pending', '屋外の低温施工も対応可能。12月の第2週から参加できます。', null, null, null, now() - interval '2 days'),
    (r3, p3, m, t, tenant_owner, 'approved', '経過観察の来店案内まで対応します。', '承認。', mfr_admin, '2025-09-15 10:00+09', '2025-09-05 10:00+09'),
    (r4, p3, m, t, tenant_owner, 'withdrawn', '一次募集で参加が決まったため取り下げ。', null, null, null, '2025-10-03 10:00+09');

  -- 契約（NDA・参加規約）
  insert into ft_agreements (project_id, manufacturer_id, tenant_id, agreement_type, document_url, document_text, accepted, accepted_by, accepted_at, created_at)
  values
    (p1, m, t, 'nda', 'https://example.com/demo-manufacturer/nda.pdf', '発売前製品の仕様・評価結果を第三者に開示しないこと。', true, tenant_owner, '2026-07-26 09:30+09', '2026-07-25 15:00+09'),
    (p1, m, t, 'terms', 'https://example.com/demo-manufacturer/ft-terms.pdf', '施工条件・証拠写真の提出・不具合報告の手順に従うこと。', true, tenant_owner, '2026-07-26 09:32+09', '2026-07-25 15:00+09'),
    (p1, m, t, 'other', null, '材料受領書（支給材料 30台分）', false, null, null, '2026-07-28 10:00+09'),
    (p3, m, t, 'nda', null, '改良版の評価結果を第三者に開示しないこと。', true, tenant_owner, '2025-09-16 10:00+09', '2025-09-15 10:00+09');

  -- 研修
  insert into ft_training_modules (id, project_id, manufacturer_id, title, description, content_url, sort_order, is_required, created_at)
  values
    (tm1, p1, m, '製品概要と施工手順（動画 18分）', 'デモ セラミック EX の成分・下地処理・塗り込み・拭き上げの手順。', 'https://example.com/demo-manufacturer/training/ex-procedure', 1, true, '2026-07-20 10:00+09'),
    (tm2, p1, m, '証拠写真の撮り方と提出ルール', '施工前・施工中・施工後・膜厚測定の撮影位置と枚数。', 'https://example.com/demo-manufacturer/training/evidence', 2, true, '2026-07-20 10:00+09'),
    (tm3, p1, m, 'よくある施工不良と対処（任意）', 'ムラ・拭き残し・硬化不良の見分け方。', 'https://example.com/demo-manufacturer/training/troubleshooting', 3, false, '2026-07-20 10:00+09');
  insert into ft_training_completions (module_id, tenant_id, completed_by, completed_at)
  values (tm1, t, tenant_owner, '2026-07-28 14:00+09'), (tm2, t, tenant_owner, '2026-07-28 15:10+09');

  -- 施工条件（実施中のテスト）
  insert into ft_conditions (id, project_id, manufacturer_id, label, description, check_type, numeric_min, numeric_max, unit, is_required, sort_order)
  values
    (c1, p1, m, '下地処理（脱脂・鉄粉除去）', '施工前に脱脂と鉄粉除去を行ったか。', 'boolean', null, null, null, true, 1),
    (c2, p1, m, '施工時の気温', '施工ブース内の気温。', 'numeric', 10, 35, '℃', true, 2),
    (c3, p1, m, '施工時の湿度', '施工ブース内の湿度。', 'numeric', null, 80, '%', true, 3),
    (c4, p1, m, '使用ロット番号', '支給材料のボトルに記載のロット番号。', 'text', null, null, null, true, 4),
    (c5, p1, m, '硬化後の撥水写真', '24時間後に水をかけた状態を撮影。', 'photo', null, null, null, false, 5);
  select coalesce(jsonb_agg(to_jsonb(fc) order by fc.sort_order), '[]'::jsonb) into snap from ft_conditions fc where fc.project_id = p1;

  -- 施工案件（状態をひと通り）
  insert into ft_jobs (id, project_id, manufacturer_id, tenant_id, job_code, title, description, status, conditions_snapshot, assigned_by, assigned_at, completed_at)
  values
    (j1, p1, m, t, 'FT-EX-001', 'ハリアー（パール）ボディ全面', '新車。納車前施工。', 'completed', snap, mfr_admin, '2026-08-04 10:00+09', '2026-08-08 17:00+09'),
    (j2, p1, m, t, 'FT-EX-002', 'アルファード（黒）ボディ全面＋ホイール', '登録1年。鉄粉多め。', 'completed', snap, mfr_admin, '2026-08-18 10:00+09', '2026-08-23 17:00+09'),
    (j3, p1, m, t, 'FT-EX-003', 'プリウス（白）ボディ全面', '経年3年。磨き込みあり。', 'inspection', snap, mfr_admin, '2026-09-08 10:00+09', null),
    (j4, p1, m, t, 'FT-EX-004', 'CX-60（赤）ボディ全面', '新車。', 'evidence_submitted', snap, mfr_admin, '2026-09-22 10:00+09', null),
    (j5, p1, m, t, 'FT-EX-005', 'セレナ（グレー）ボディ全面', '登録2年。', 'in_progress', snap, mfr_admin, '2026-10-02 10:00+09', null),
    (j6, p1, m, t, 'FT-EX-006', 'ヴェゼル（青）ボディ全面', '新車。10月中旬入庫予定。', 'assigned', snap, mfr_admin, '2026-10-08 10:00+09', null),
    (j7, p1, m, t, 'FT-EX-007', 'レヴォーグ（銀）ボディ全面', '施工条件（湿度）を満たさず、再施工扱い。', 'rejected', snap, mfr_admin, '2026-09-01 10:00+09', null),
    (j8, p3, m, t, 'FT-25-001', 'クラウン（黒）ボディ全面', '半年経過観察済み。', 'completed', '[]', mfr_admin, '2025-10-06 10:00+09', '2025-10-10 17:00+09'),
    (j9, p3, m, t, 'FT-25-002', 'ステップワゴン（白）ボディ全面', '半年経過観察済み。', 'completed', '[]', mfr_admin, '2025-10-14 10:00+09', '2025-10-18 17:00+09');

  -- 施工条件の記録（施工が進んだ案件）
  insert into ft_condition_checks (job_id, condition_id, value_boolean, value_numeric, value_text, checked_by, checked_at)
  select x.job_id, x.cond, x.b, x.n, x.txt, tenant_owner, x.at
  from (values
    (j1, c1, true,  null::numeric, null, '2026-08-05 09:10+09'::timestamptz),
    (j1, c2, null,  24,   null, '2026-08-05 09:12+09'),
    (j1, c3, null,  55,   null, '2026-08-05 09:12+09'),
    (j1, c4, null,  null, 'DCE-2607-B', '2026-08-05 09:15+09'),
    (j1, c5, null,  null, '撮影済み（3枚）', '2026-08-06 10:00+09'),
    (j2, c1, true,  null, null, '2026-08-19 09:05+09'),
    (j2, c2, null,  29,   null, '2026-08-19 09:08+09'),
    (j2, c3, null,  62,   null, '2026-08-19 09:08+09'),
    (j2, c4, null,  null, 'DCE-2607-B', '2026-08-19 09:10+09'),
    (j3, c1, true,  null, null, '2026-09-09 09:00+09'),
    (j3, c2, null,  22,   null, '2026-09-09 09:02+09'),
    (j3, c3, null,  58,   null, '2026-09-09 09:02+09'),
    (j3, c4, null,  null, 'DCE-2609-A', '2026-09-09 09:05+09'),
    (j4, c1, true,  null, null, '2026-09-23 09:00+09'),
    (j4, c2, null,  26,   null, '2026-09-23 09:01+09'),
    (j4, c3, null,  60,   null, '2026-09-23 09:01+09'),
    (j7, c1, false, null, null, '2026-09-02 09:00+09'),
    (j7, c3, null,  88,   null, '2026-09-02 09:01+09')
  ) as x(job_id, cond, b, n, txt, at);

  -- 証拠データ（ファイル本体は置かない。画面は種類・説明・日時を出す）
  insert into ft_evidence (job_id, project_id, manufacturer_id, tenant_id, evidence_type, file_name, content_type, caption, metadata, captured_at, captured_by)
  select x.job_id, x.proj, m, t, x.typ, x.fname, x.ctype, x.caption, x.meta, x.at, tenant_owner
  from (values
    (j1, p1, 'photo_before', 'ex001_before.jpg', 'image/jpeg', '施工前 ボディ全体（4方向）', '{}'::jsonb, '2026-08-05 09:00+09'::timestamptz),
    (j1, p1, 'photo_during', 'ex001_during.jpg', 'image/jpeg', '塗り込み中 ボンネット', '{}', '2026-08-05 13:00+09'),
    (j1, p1, 'photo_after',  'ex001_after.jpg',  'image/jpeg', '施工後 ボディ全体（4方向）', '{}', '2026-08-06 10:00+09'),
    (j1, p1, 'measurement',  'ex001_thickness.csv', 'text/csv', '膜厚測定 ボンネット 1.6µm / ルーフ 1.5µm', '{"unit":"µm","points":8}', '2026-08-06 10:30+09'),
    (j1, p1, 'env_data',     null, null, '施工ブース 気温24℃ / 湿度55%', '{"temperature_c":24,"humidity_pct":55}', '2026-08-05 09:12+09'),
    (j2, p1, 'photo_before', 'ex002_before.jpg', 'image/jpeg', '施工前 鉄粉除去後', '{}', '2026-08-19 09:00+09'),
    (j2, p1, 'photo_after',  'ex002_after.jpg',  'image/jpeg', '施工後 ボディ全体', '{}', '2026-08-20 11:00+09'),
    (j2, p1, 'video',        'ex002_water.mp4',  'video/mp4',  '24時間後の撥水（動画 20秒）', '{}', '2026-08-21 10:00+09'),
    (j3, p1, 'photo_before', 'ex003_before.jpg', 'image/jpeg', '施工前 磨き込み後', '{}', '2026-09-09 09:00+09'),
    (j3, p1, 'photo_after',  'ex003_after.jpg',  'image/jpeg', '施工後 ボディ全体', '{}', '2026-09-10 10:00+09'),
    (j3, p1, 'document',     'ex003_record.pdf', 'application/pdf', '施工記録シート（スタッフ記入）', '{}', '2026-09-10 10:30+09'),
    (j4, p1, 'photo_before', 'ex004_before.jpg', 'image/jpeg', '施工前 ボディ全体', '{}', '2026-09-23 09:00+09'),
    (j4, p1, 'photo_after',  'ex004_after.jpg',  'image/jpeg', '施工後 ボディ全体', '{}', '2026-09-24 10:00+09'),
    (j7, p1, 'env_data',     null, null, '施工ブース 湿度88%（条件外）', '{"temperature_c":27,"humidity_pct":88}', '2026-09-02 09:01+09'),
    (j7, p1, 'other',        null, null, '再施工の日程調整メモ', '{}', '2026-09-03 12:00+09'),
    (j8, p3, 'photo_after',  'g25_001_6month.jpg', 'image/jpeg', '半年後の撥水', '{}', '2026-04-10 10:00+09'),
    (j9, p3, 'photo_after',  'g25_002_6month.jpg', 'image/jpeg', '半年後の撥水', '{}', '2026-04-18 10:00+09')
  ) as x(job_id, proj, typ, fname, ctype, caption, meta, at);

  -- 検査
  insert into ft_inspections (job_id, project_id, manufacturer_id, inspector_user_id, result, score, notes, checklist, inspected_at)
  values
    (j1, p1, m, mfr_admin, 'pass', 94, '艶・均一性ともに良好。膜厚も規定内。',
     '[{"item":"艶ムラ","ok":true},{"item":"拭き残し","ok":true},{"item":"膜厚 1.2µm以上","ok":true},{"item":"撥水","ok":true}]', '2026-08-08 15:00+09'),
    (j2, p1, m, mfr_admin, 'conditional_pass', 78, 'リア側に軽い拭き残し。再拭き上げで合格とする。',
     '[{"item":"艶ムラ","ok":true},{"item":"拭き残し","ok":false},{"item":"膜厚 1.2µm以上","ok":true},{"item":"撥水","ok":true}]', '2026-08-23 15:00+09'),
    (j3, p1, m, mfr_admin, 'pending', null, '10月中に来店して確認予定。', '[]', null),
    (j7, p1, m, mfr_admin, 'fail', 42, '湿度88%で施工。硬化不良でムラが出たため不合格。再施工を依頼。',
     '[{"item":"艶ムラ","ok":false},{"item":"拭き残し","ok":true},{"item":"膜厚 1.2µm以上","ok":false},{"item":"撥水","ok":false}]', '2026-09-05 15:00+09'),
    (j8, p3, m, mfr_admin, 'pass', 88, '半年後も撥水良好。', '[]', '2026-04-10 15:00+09'),
    (j9, p3, m, mfr_admin, 'pass', 91, '半年後も撥水良好。', '[]', '2026-04-18 15:00+09');

  -- 不具合（重大度4種・状態5種をひと通り）
  insert into ft_defects (job_id, project_id, manufacturer_id, tenant_id, defect_code, title, description, severity, status, resolution, reported_by, resolved_by, resolved_at, created_at)
  values
    (j7, p1, m, t, 'DEF-001', '硬化不良によるムラ', '高湿度（88%）環境で施工し、ボンネットとルーフに白っぽいムラが出た。', 'high', 'resolved',
     '再研磨のうえ再施工。施工条件に「湿度80%以下」を必須として明記した。', tenant_owner, mfr_admin, '2026-09-12 17:00+09', '2026-09-03 10:00+09'),
    (j2, p1, m, t, 'DEF-002', 'リア周りの拭き残し', '暗所で見落としやすい。拭き上げ手順にライト確認を追加したい。', 'low', 'closed',
     '研修資料に追記済み。', mfr_admin, mfr_admin, '2026-08-30 12:00+09', '2026-08-23 16:00+09'),
    (j3, p1, m, t, 'DEF-003', '樹脂パーツへの白化', '未塗装樹脂（モール）に付着した液が白く残った。', 'medium', 'investigating',
     null, tenant_owner, null, null, '2026-09-11 11:00+09'),
    (j4, p1, m, t, 'DEF-004', 'ボトルのキャップ破損（2本）', '支給材料のうち2本でキャップに亀裂。内容物の漏れは無し。', 'critical', 'open',
     null, tenant_owner, null, null, now() - interval '1 day'),
    (j1, p1, m, t, 'DEF-005', 'ラベル表記の誤字', 'ボトルのラベルに誤字（「硬化時間」が「硬貨時間」）。施工品質には影響なし。', 'low', 'wontfix',
     '次回ロットで修正。今回は対応しない。', tenant_owner, mfr_admin, '2026-08-12 10:00+09', '2026-08-07 10:00+09');

  -- ─── 施工店の設備・資格（デモ施工店）────────────────────────────
  insert into workshop_capability_profiles (tenant_id, permits, mechanic_certifications, has_lift, has_diagnostic_tools, has_adas_equipment, equipment_notes,
    ev_capable, body_work, painting, coating, ppf, electrical, mobile_service, supported_vehicles, service_area, verified_at, verified_by)
  values (t,
    '[{"type":"認証工場","number":"関自整第0000号","expires_at":"2028-03-31"},{"type":"特定整備（電子制御装置整備）","number":"関自特第0000号"}]',
    '[{"grade":"一級自動車整備士","holder_name":"整備 一郎"},{"grade":"二級自動車整備士","holder_name":"整備 二郎"},{"grade":"デモコーティング工業 認定施工技術者","holder_name":"施工 三郎"}]',
    true, true, true, '屋内コーティングブース2基（温湿度管理）、膜厚計、エーミング用ターゲット一式。',
    true, true, false, true, true, true, false,
    '["国産車","輸入車","EV・HV","商用バン"]',
    '{"prefectures":["東京都","神奈川県","埼玉県"],"radius_km":30,"notes":"出張施工は要相談"}',
    '2026-07-24 10:00+09', mfr_admin)
  on conflict (tenant_id) do update set permits = excluded.permits, mechanic_certifications = excluded.mechanic_certifications,
    has_lift = excluded.has_lift, has_diagnostic_tools = excluded.has_diagnostic_tools, has_adas_equipment = excluded.has_adas_equipment,
    equipment_notes = excluded.equipment_notes, ev_capable = excluded.ev_capable, body_work = excluded.body_work, painting = excluded.painting,
    coating = excluded.coating, ppf = excluded.ppf, electrical = excluded.electrical, mobile_service = excluded.mobile_service,
    supported_vehicles = excluded.supported_vehicles, service_area = excluded.service_area,
    verified_at = excluded.verified_at, verified_by = excluded.verified_by;

  -- ─── 通知（未読2・既読3）──────────────────────────────────────
  delete from manufacturer_notifications where manufacturer_id = m;
  insert into manufacturer_notifications (manufacturer_id, user_id, notification_type, priority, title, body, link_path, read_at, created_at)
  values
    (m, null, 'ft_defect_reported', 'high', '不具合報告: ボトルのキャップ破損（2本）', 'Ledra Motors（デモ）から重大度「重大」の報告がありました。',
     '/manufacturer/field-test/' || p1, null, now() - interval '1 day'),
    (m, null, 'ft_application_received', 'normal', '冬季テストに応募がありました', 'Ledra Motors（デモ）が「冬季テスト 参加施工店募集」に応募しました。',
     '/manufacturer/field-test/' || p2, null, now() - interval '2 days'),
    (m, null, 'ft_evidence_submitted', 'normal', '証拠データが提出されました: FT-EX-004', 'CX-60（赤）ボディ全面 の施工前後の写真が提出されました。',
     '/manufacturer/field-test/' || p1 || '/jobs/' || j4, now() - interval '10 days', now() - interval '18 days'),
    (m, null, 'ft_inspection_completed', 'normal', '検査結果: FT-EX-007 不合格', '湿度条件外の施工による硬化不良。再施工を依頼しました。',
     '/manufacturer/field-test/' || p1 || '/jobs/' || j7, now() - interval '30 days', now() - interval '37 days'),
    (m, null, 'ft_agreement_accepted', 'normal', '契約の同意: NDA・参加規約', 'Ledra Motors（デモ）が「デモ セラミック EX 実証テスト」の NDA と参加規約に同意しました。',
     '/manufacturer/field-test/' || p1, now() - interval '70 days', now() - interval '78 days');
end $$;
