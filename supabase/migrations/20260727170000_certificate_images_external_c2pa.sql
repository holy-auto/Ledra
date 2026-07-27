-- 外部（カメラ/他アプリ）が付けた C2PA Content Credential のアップロード時検証結果。
-- Ledra の EXIF strip / 再エンコード前の「原バイト」に対して検証した結果のみを保存する。
--   external_c2pa_present  : 受信画像に C2PA マニフェストが埋め込まれていたか
--   external_c2pa_verified : 署名・内容束縛が有効か（信頼リスト未登録=untrusted は致命としない）
--   external_c2pa_signer   : 署名者（signature issuer / claim_generator）
-- 追加のみ・NULL 許容・デフォルト無しで後方互換。
ALTER TABLE certificate_images
  ADD COLUMN IF NOT EXISTS external_c2pa_present boolean,
  ADD COLUMN IF NOT EXISTS external_c2pa_verified boolean,
  ADD COLUMN IF NOT EXISTS external_c2pa_signer text;

COMMENT ON COLUMN certificate_images.external_c2pa_present IS
  '受信画像（原バイト）に外部C2PAマニフェストが埋め込まれていたか。';
COMMENT ON COLUMN certificate_images.external_c2pa_verified IS
  '外部C2PA署名・内容束縛が有効か。false=改変/署名失敗の疑い。present=false のとき NULL。';
COMMENT ON COLUMN certificate_images.external_c2pa_signer IS
  '外部C2PAの署名者（signature issuer / claim_generator）。';
