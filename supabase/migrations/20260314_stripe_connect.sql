-- ============================================================
-- Stripe Connect 基盤準備 マイグレーション
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_connect_onboarded boolean DEFAULT false;
