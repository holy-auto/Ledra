-- ============================================================
-- signature_sessions.certificate_id を nullable に変更
--
-- 背景:
--   施工証明書（certificates）以外（代理店契約書・NDA 等）にも
--   Ledra 自前署名エンジンを適用するため、certificate_id を
--   必須から任意に変更する。
--
--   代理店契約書の場合は certificate_id = NULL となり、
--   agent_signing_requests.ledra_session_id で紐付けを管理する。
-- ============================================================

-- FK 制約を一旦削除して nullable に変更し、再設定
ALTER TABLE signature_sessions
  ALTER COLUMN certificate_id DROP NOT NULL;

-- コメント更新
COMMENT ON COLUMN signature_sessions.certificate_id IS
  '施工証明書 ID。施工証明書の署名の場合は必須。代理店契約書等は NULL。';
