-- ============================================================
-- tenants.plan_tier の CHECK 制約を実態(4tier)に合わせて修正
--
-- 注意: 本番DBでは plan_tier は既に plan_tier_enum 型に変換済み
-- (マイグレーション履歴外でダッシュボードから変更されたとみられる)。
-- そのため本番の新規登録失敗の直接原因ではない。
-- このマイグレーションは、マイグレーション履歴だけから再構築した
-- 環境(ローカル/CI/新規Supabaseプロジェクト)で
-- 20260313020000_core_tables.sql の古いCHECK制約(mini/standard/pro)
-- が残ったまま plan_tier='free' のINSERTが失敗する、という
-- 本番との乖離を防ぐための整合性修正。
-- ============================================================

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_tier_check;

ALTER TABLE tenants ADD CONSTRAINT tenants_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'standard', 'pro'));
