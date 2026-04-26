-- Invoice automation columns for BtoB order payment flow
-- Adds requester contact info, invoice tracking, and payout tracking to job_orders

ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS requester_email    text,
  ADD COLUMN IF NOT EXISTS requester_company  text,
  ADD COLUMN IF NOT EXISTS invoice_number     text,
  ADD COLUMN IF NOT EXISTS invoice_sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_due_date   date,
  ADD COLUMN IF NOT EXISTS platform_fee_rate  numeric NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric,
  ADD COLUMN IF NOT EXISTS payout_amount      numeric,
  ADD COLUMN IF NOT EXISTS payout_stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS payout_executed_at timestamptz;

COMMENT ON COLUMN job_orders.requester_email    IS '請求書の送付先メールアドレス（発注企業担当者）';
COMMENT ON COLUMN job_orders.requester_company  IS '請求書の宛名（発注企業名）';
COMMENT ON COLUMN job_orders.invoice_number     IS '自動採番された請求書番号';
COMMENT ON COLUMN job_orders.invoice_sent_at    IS '請求書メール送付日時';
COMMENT ON COLUMN job_orders.invoice_due_date   IS '支払期限（通常: 請求日+30日）';
COMMENT ON COLUMN job_orders.platform_fee_rate  IS 'プラットフォーム手数料率（デフォルト10%）';
COMMENT ON COLUMN job_orders.platform_fee_amount IS '手数料金額（accepted_amount × platform_fee_rate）';
COMMENT ON COLUMN job_orders.payout_amount       IS '施工店への送金額（accepted_amount - platform_fee_amount）';
COMMENT ON COLUMN job_orders.payout_stripe_transfer_id IS 'Stripe Connect転送ID。"manual_required"はConnect未設定で手動対応が必要';
COMMENT ON COLUMN job_orders.payout_executed_at  IS 'Stripe Connect転送実行日時';
