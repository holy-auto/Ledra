-- reservations に「自動作成した下書き証明書」への参照列を追加。
--
-- 背景: auto-action `certificate.auto_create_draft_record` が opt-in されている
-- テナントでは、案件完了時に証明書を status=draft の行として自動起票する。
-- この列はその証明書 (certificates.id) を指し、二重起票の防止 (冪等) と、
-- 案件 → 下書き証明書 の逆引きに使う。
--
-- - nullable (NULL = 未作成 / auto OFF / 車両・顧客なし)
-- - 発行 (draft→active = 法的確定) は必ず人が行う (壁3)。証明書を active で
--   自動作成することは無い。
-- - 証明書が削除されたら参照は外す (ON DELETE SET NULL)。

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS ai_certificate_id uuid REFERENCES certificates(id) ON DELETE SET NULL;

COMMENT ON COLUMN reservations.ai_certificate_id IS
  'certificate.auto_create_draft_record が自動起票した下書き証明書 (certificates.id)。NULL = 未作成。発行は必ず人が行う (壁3)。';
