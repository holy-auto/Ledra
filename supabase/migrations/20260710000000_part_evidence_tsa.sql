-- 部品装着エビデンス写真の撮影時刻封印 (RFC3161 TSA)。
--
-- 証明書写真 (certificate_images) は Phase 1 で撮影時来歴の TSA 封印列を持つが、
-- 部品エビデンス写真 (part_installation_evidence) は「確定署名 (signConfirmation) 時の
-- 署名封印」しか持たず、確定前・required_assurance='any' で確定が起きない場合は
-- 写真自体に一切の時刻封印が無い。ステージ時 (evidence-upload) に写真ハッシュ単体を
-- TSA 封印できるよう列を追加する (nullable・既定 no-op、PARTS_TSA_ENABLED=false なら不変)。

ALTER TABLE part_installation_evidence
  ADD COLUMN IF NOT EXISTS tsa_authority    text,
  ADD COLUMN IF NOT EXISTS tsa_timestamp_at timestamptz;

COMMENT ON COLUMN part_installation_evidence.tsa_authority IS
  '証拠写真ステージ時 (evidence-upload) に取得した RFC3161 TSA局。確定署名時のTSA (part_installations.tsa_authority) とは別物 — 写真自体の存在時刻を封印する。';
COMMENT ON COLUMN part_installation_evidence.tsa_timestamp_at IS
  'TSA局が証明した証拠写真の存在時刻 (genTime)。';
