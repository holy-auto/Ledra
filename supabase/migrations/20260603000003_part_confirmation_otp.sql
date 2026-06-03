-- =============================================================================
-- 部品装着インテグリティ — Phase 3: 確定署名の OTP 所持証明カラム
--
-- 設計: docs/parts-installation-integrity-design.md §6.4
--
-- part_confirmation_signatures に電話OTPの検証状態を持たせる。
-- 既存テーブルへの追加のみ（nullable / 既定値あり）。
-- =============================================================================

ALTER TABLE part_confirmation_signatures
  ADD COLUMN IF NOT EXISTS otp_code_hash   text,
  ADD COLUMN IF NOT EXISTS otp_attempts    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_expires_at  timestamptz;

COMMENT ON COLUMN part_confirmation_signatures.otp_code_hash IS
  'sha256(partotp|v1|token|code|PEPPER)。生コードは保存しない。';
