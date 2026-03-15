-- ============================================================
-- 保険案件テストデータ seed
-- ============================================================
-- 前提:
--   1. insurers / insurer_users テーブルが作成済み
--   2. insurance_cases + 関連テーブルが作成済み
--   3. tenants / vehicles / auth.users が存在すること
--
-- 使い方:
--   Supabase SQL Editor で実行するか、
--   実在するID に置き換えてから実行してください。
-- ============================================================

-- ★ 以下のプレースホルダーを実際のIDに置き換えてください ★
-- <TENANT_ID>      : テナントのID（tenants テーブル）
-- <VEHICLE_ID>     : 車両のID（vehicles テーブル）
-- <INSURER_ID>     : 保険会社のID（insurers テーブル）
-- <SHOP_USER_ID>   : 施工店ユーザーのID（auth.users）
-- <INSURER_USER_ID>: 保険会社ユーザーのID（auth.users）

-- ============================================================
-- 1) テスト用保険会社（まだ無い場合）
-- ============================================================
INSERT INTO insurers (id, name, name_kana, code, contact_email, is_active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'テスト損害保険株式会社',
  'テストソンガイホケン',
  'TEST001',
  'test@insurer.example.com',
  true
) ON CONFLICT DO NOTHING;

-- ============================================================
-- 2) テスト案件データ
-- ============================================================
-- ★ 下記の <TENANT_ID>, <VEHICLE_ID> は実際のIDに差し替え ★

-- 案件1: 事故入庫 — 確認中
-- INSERT INTO insurance_cases (
--   tenant_id, vehicle_id, insurer_id,
--   case_number, case_type, title, description,
--   damage_summary, admitted_at, status,
--   submitted_at, created_by
-- ) VALUES (
--   '<TENANT_ID>',
--   '<VEHICLE_ID>',
--   'a0000000-0000-0000-0000-000000000001',
--   'IC-20260315-001',
--   'accident',
--   '右フロントドア 板金修理',
--   '右側面の衝突により板金修理が必要。',
--   '右フロントドア凹み、塗装剥がれ',
--   '2026-03-10',
--   'under_review',
--   now() - interval '3 days',
--   '<SHOP_USER_ID>'
-- );

-- 案件2: 車両保険 — 提出済み
-- INSERT INTO insurance_cases (
--   tenant_id, vehicle_id, insurer_id,
--   case_number, case_type, title,
--   status, submitted_at, created_by
-- ) VALUES (
--   '<TENANT_ID>',
--   '<VEHICLE_ID>',
--   'a0000000-0000-0000-0000-000000000001',
--   'IC-20260315-002',
--   'vehicle_insurance',
--   'フロントガラス交換',
--   'submitted',
--   now() - interval '1 day',
--   '<SHOP_USER_ID>'
-- );

-- 案件3: 損傷確認 — 情報依頼中
-- INSERT INTO insurance_cases (
--   tenant_id, vehicle_id, insurer_id,
--   case_number, case_type, title,
--   status, submitted_at, created_by
-- ) VALUES (
--   '<TENANT_ID>',
--   '<VEHICLE_ID>',
--   'a0000000-0000-0000-0000-000000000001',
--   'IC-20260315-003',
--   'damage_check',
--   '後部バンパー損傷確認',
--   'info_requested',
--   now() - interval '5 days',
--   '<SHOP_USER_ID>'
-- );

-- ============================================================
-- 3) 参加者の登録
-- ============================================================
-- ★ 案件IDと実際のuser_idを使って登録 ★
-- INSERT INTO insurance_case_participants (case_id, user_id, role, added_by)
-- VALUES
--   ('<CASE_ID>', '<SHOP_USER_ID>', 'shop_owner', '<SHOP_USER_ID>'),
--   ('<CASE_ID>', '<INSURER_USER_ID>', 'insurer_reviewer', '<SHOP_USER_ID>');

-- ============================================================
-- 4) テストメッセージ
-- ============================================================
-- INSERT INTO insurance_case_messages (case_id, sender_id, visibility, body)
-- VALUES
--   ('<CASE_ID>', '<SHOP_USER_ID>', 'shared', '右フロントドアの板金修理をお見積もりいたしました。添付の見積書をご確認ください。'),
--   ('<CASE_ID>', '<INSURER_USER_ID>', 'shared', '見積書を確認しました。追加の写真をお送りいただけますか？'),
--   ('<CASE_ID>', '<SHOP_USER_ID>', 'internal', '【社内メモ】見積もりは高めに出した。値引き余地あり。'),
--   ('<CASE_ID>', '<SHOP_USER_ID>', 'shared', '追加の写真を添付しました。ご確認をお願いいたします。');

-- ============================================================
-- 使い方ガイド:
-- 1. コメントを外して、プレースホルダーを実際のIDに置き換える
-- 2. Supabase SQL Editor で実行
-- 3. /admin/insurance-cases と /insurer/cases で表示を確認
-- ============================================================
