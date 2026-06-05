-- =============================================================================
-- 部品装着インテグリティ — 確定OTP検証の原子化（ブルートフォース耐性の強化）
--
-- 設計: docs/parts-installation-integrity-design.md §6.4
--
-- 旧来は app 側で「SELECT otp_attempts → 比較 → UPDATE otp_attempts+1」と
-- read-then-write していたため、並行リクエストが同じ otp_attempts を読み、
-- MAX_OTP_ATTEMPTS を超える試行が可能だった（OTP 総当たりの窓が開く）。
-- 同一確定トークン行を FOR UPDATE で直列化し、「検査＋試行加算 or 確定」を
-- 1関数に閉じ込めることで、試行回数を厳密に上限化する。
--
-- コード一致比較は SQL 側で行う（peppered SHA-256 同士の等値比較のため
-- 定数時間比較が無くても実用上のタイミング攻撃面は無い）。原子性の確保を優先。
--
-- 既存 increment_intake_ocr_attempts / part_register_serial と同じ
--   SECURITY DEFINER + SET search_path = '' 規約（全オブジェクトを public. で修飾）。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.part_verify_otp(
  p_token        text,
  p_tenant_id    uuid,
  p_code_hash    text,
  p_max_attempts integer,
  p_ip           text,
  p_user_agent   text
)
RETURNS text  -- 'ok' | 'mismatch' | 'locked' | 'expired' | 'processed' | 'not_found'
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.part_confirmation_signatures%ROWTYPE;
BEGIN
  -- 同一トークン行を直列化（並行 OTP 試行のレースを排除）。
  SELECT * INTO v_row
  FROM public.part_confirmation_signatures
  WHERE token = p_token AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN 'processed';
  END IF;

  IF v_row.otp_expires_at IS NOT NULL AND v_row.otp_expires_at < now() THEN
    RETURN 'expired';
  END IF;

  IF COALESCE(v_row.otp_attempts, 0) >= p_max_attempts THEN
    RETURN 'locked';
  END IF;

  -- コード不一致 → 行ロック下で試行回数を厳密に +1。
  IF v_row.otp_code_hash IS NULL OR v_row.otp_code_hash <> p_code_hash THEN
    UPDATE public.part_confirmation_signatures
    SET otp_attempts = COALESCE(otp_attempts, 0) + 1
    WHERE id = v_row.id;
    RETURN 'mismatch';
  END IF;

  -- 一致 → otp_verified へ確定（本人確認完了）。
  UPDATE public.part_confirmation_signatures
  SET status            = 'otp_verified',
      otp_verified_at   = now(),
      signer_ip         = p_ip,
      signer_user_agent = p_user_agent
  WHERE id = v_row.id;

  RETURN 'ok';
END;
$$;

-- Supabase の default privileges は public スキーマの新規関数に anon/authenticated への
-- EXECUTE を自動付与するため、`FROM public` だけでは消えない。この RPC はサーバの
-- service-role からのみ呼ばれ、p_max_attempts も引数で受けるので、anon/authenticated/PUBLIC
-- から明示的に剥奪して service_role 専用にする。
REVOKE ALL ON FUNCTION public.part_verify_otp(text, uuid, text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_verify_otp(text, uuid, text, integer, text, text) TO service_role;
